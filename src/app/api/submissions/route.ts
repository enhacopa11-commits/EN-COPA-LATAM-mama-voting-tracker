import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createWorker } from "tesseract.js";
import { randomUUID } from "node:crypto";

export const maxDuration = 300;

const MAX_FILES = 5;
const MAX_SIZE = 5 * 1024 * 1024;
const MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server configuration is incomplete.");
  return createClient(url, key);
}

function kstDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDate(text: string): string | null {
  const patterns = [
    /\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/,
    /\b(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])[-/.](20\d{2})\b/,
    /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+([0-3]?\d),?\s+(20\d{2})\b/i,
    /\b([0-3]?\d)\s+(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(20\d{2})\b/i,
  ];

  let year: number, month: number, day: number;
  let match = text.match(patterns[0]);
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else if ((match = text.match(patterns[1]))) {
    month = Number(match[1]); day = Number(match[2]); year = Number(match[3]);
  } else {
    const months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
    if ((match = text.match(patterns[2]))) {
      month = months.indexOf(match[1].toUpperCase()) + 1;
      day = Number(match[2]); year = Number(match[3]);
    } else if ((match = text.match(patterns[3]))) {
      day = Number(match[1]);
      month = months.indexOf(match[2].toUpperCase()) + 1;
      year = Number(match[3]);
    } else return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractReference(text: string): string | null {
  const patterns = [
    /(?:reference|ref(?:erence)?\s*(?:no|number|#|id)?|certificate\s*(?:no|number|id)|confirmation\s*(?:no|number|code)|vote\s*(?:no|number|id))\s*[:#\-]?\s*([A-Z0-9][A-Z0-9-]{5,})/i,
    /\b(?:ID|NO)\s*[:#]\s*([A-Z0-9][A-Z0-9-]{5,})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function isAllowedDate(date: string, today: string) {
  const value = Date.parse(`${date}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  return Math.abs(value - current) <= 86400000;
}

export async function POST(request: Request) {
  const supabase = getSupabase();

  try {
    const form = await request.formData();
    const username = String(form.get("username") || "").trim().replace(/^@/, "");
    const countryCode = String(form.get("countryCode") || "").toUpperCase();
    const files = form.getAll("screenshots").filter((v): v is File => v instanceof File);

    if (!/^[A-Za-z0-9_]{1,15}$/.test(username) || !/^[A-Z]{2}$/.test(countryCode)) {
      return NextResponse.json({ error: "Invalid X username or country." }, { status: 400 });
    }
    if (!files.length || files.length > MAX_FILES) {
      return NextResponse.json({ error: "Upload between 1 and 5 images." }, { status: 400 });
    }

    for (const file of files) {
      if (!MIME_TYPES.includes(file.type) || file.size > MAX_SIZE || file.size === 0) {
        return NextResponse.json({ error: "Invalid image type or size. Maximum 5 MB per image." }, { status: 400 });
      }
    }

    let { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id")
      .eq("x_username", username)
      .maybeSingle();

    if (participantError) throw participantError;

    if (!participant) {
      const result = await supabase.from("participants")
        .insert({ x_username: username, country_code: countryCode })
        .select("id").single();

      if (result.error?.code === "23505") {
        const retry = await supabase.from("participants")
          .select("id").eq("x_username", username).single();
        if (retry.error) throw retry.error;
        participant = retry.data;
      } else if (result.error) throw result.error;
      else participant = result.data;
    }

    const today = kstDate();
    const results: Array<Record<string, unknown>> = [];
    const worker = await createWorker("eng");

    try {
      for (const file of files) {
        const id = randomUUID();
        const storagePath = `${participant.id}/${id}.${file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg"}`;
        const bytes = Buffer.from(await file.arrayBuffer());

        const stored = await supabase.storage.from("certificates").upload(storagePath, bytes, {
          contentType: file.type,
          upsert: false,
        });

        if (stored.error) {
          results.push({ filename: file.name, status: "rejected", message: "Private image storage failed." });
          continue;
        }

        const uploaded = await supabase.from("certificate_uploads").insert({
          id,
          participant_id: participant.id,
          storage_path: storagePath,
          original_filename: file.name.slice(0, 255),
          mime_type: file.type,
          size_bytes: file.size,
          status: "processing",
        }).select("id").single();

        if (uploaded.error) {
          await supabase.storage.from("certificates").remove([storagePath]);
          results.push({ filename: file.name, status: "rejected", message: "Could not save submission record." });
          continue;
        }

        try {
          const recognition = await worker.recognize(bytes);
          const text = recognition.data.text || "";
          const confidence = Number(recognition.data.confidence || 0);
          const reference = extractReference(text);
          const certificateDate = parseDate(text);
          const normalizedText = text.toUpperCase().replace(/[^A-Z0-9]+/g, " ");
          const artist = /\\bCORTIS\\b/.test(normalizedText)
            ? "CORTIS"
            : /\\bENHYPEN\\b/.test(normalizedText)
              ? "ENHYPEN"
              : null;
          const platform = artist === "CORTIS"
            ? (/MNET\\s*PLUS|MNETPLUS/.test(normalizedText)
                ? "mnet_plus"
                : (/MELON\\s*MUSIC\\s*AWARDS|\\bMMA\\b/.test(normalizedText)
                    ? "mma"
                    : null))
            : null;

          let status = "ocr_failed";
          let message = "Could not confidently read a certificate reference and date.";

          if (confidence < 45) {
            message = "Image text is not clear enough for automatic reading.";
          } else if (!reference || !certificateDate) {
            message = "Reference number or certificate date was not detected.";
          } else if (!artist) {
            message = "Artist name was not detected. Upload a clear certificate showing ENHYPEN or CORTIS.";
          } else if (artist === "CORTIS" && !platform) {
            message = "CORTIS was detected, but Mnet Plus or MMA could not be identified.";
          } else if (!isAllowedDate(certificateDate, today)) {
            status = "rejected";
            message = "Certificate date is outside the accepted KST date window.";
          } else {
            const inserted = await supabase.from("certificates").insert({
              participant_id: participant.id,
              reference_number: reference,
              certificate_date: certificateDate,
              upload_date_kst: today,
              artist,
              platform,
              status: "pending",
            });

            if (inserted.error?.code === "23505") {
              status = "rejected";
              message = "Duplicate certificate reference.";
            } else if (inserted.error) {
              throw inserted.error;
            } else {
              status = "verified";
              message = "OCR passed. Counted provisionally; not an official MAMA verification.";
            }
          }

          await supabase.from("certificate_uploads").update({
            status,
            extracted_text: text.slice(0, 20000),
            extracted_reference: reference,
            extracted_date: certificateDate,
            ocr_confidence: confidence,
            validation_message: message,
            processed_at: new Date().toISOString(),
          }).eq("id", id);

          results.push({ filename: file.name, status, message, confidence, reference, certificateDate });
        } catch (error) {
          console.error("OCR processing error:", error);
          await supabase.from("certificate_uploads").update({
            status: "ocr_failed",
            validation_message: "Automatic processing failed.",
            processed_at: new Date().toISOString(),
          }).eq("id", id);

          results.push({ filename: file.name, status: "ocr_failed", message: "Automatic processing failed." });
        }
      }
    } finally {
      await worker.terminate();
    }

    return NextResponse.json({
      participantId: participant.id,
      uploadDateKST: today,
      results,
    }, { status: 200 });
  } catch (error) {
    console.error("Submission API error:", error);
    return NextResponse.json({ error: "Could not process submissions." }, { status: 500 });
  }
}
