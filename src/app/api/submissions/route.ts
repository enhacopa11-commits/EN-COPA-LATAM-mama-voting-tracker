import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

export const maxDuration = 60;

const MAX_SIZE = 5 * 1024 * 1024;
const MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server configuration is incomplete.");
  return createClient(url, key);
}

function hammingDistance(a: string, b: string) {
  if (!/^[a-f0-9]{16}$/i.test(a) || !/^[a-f0-9]{16}$/i.test(b)) return 65;
  let value = BigInt("0x" + a) ^ BigInt("0x" + b);
  let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const campaignName = String(form.get("campaignName") || "").trim();
    const username = String(form.get("username") || "").trim().replace(/^@/, "");
    const countryCode = String(form.get("countryCode") || "").trim().toUpperCase();
    const file = form.get("screenshots");
    const perceptualHash = String(form.get("perceptualHash") || "").trim().toLowerCase();
    const ocrText = String(form.get("ocrText") || "").trim().slice(0, 12000);

    if (campaignName.length < 2 || campaignName.length > 120) {
      return NextResponse.json({ error: "Enter a voting or campaign name (2–120 characters)." }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_]{1,15}$/.test(username) || !/^[A-Z]{2}$/.test(countryCode)) {
      return NextResponse.json({ error: "Enter a valid X username and country." }, { status: 400 });
    }
    if (!(file instanceof File) || !MIME_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Upload one PNG, JPG, or WebP image up to 5 MB." }, { status: 400 });
    }

    const supabase = getSupabase();
    let { data: participant, error: participantError } = await supabase
      .from("participants").select("id").eq("x_username", username).maybeSingle();
    if (participantError) throw participantError;

    if (!participant) {
      const inserted = await supabase.from("participants")
        .insert({ x_username: username, country_code: countryCode }).select("id").single();
      if (inserted.error?.code === "23505") {
        const retry = await supabase.from("participants").select("id").eq("x_username", username).single();
        if (retry.error) throw retry.error;
        participant = retry.data;
      } else if (inserted.error) throw inserted.error;
      else participant = inserted.data;
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    // Duplicate matching is advisory only: every uploaded image is still counted.
    const { data: existing, error: duplicateLookupError } = await supabase
      .from("proof_submissions")
      .select("id,sha256,perceptual_hash,ocr_text")
      .limit(10000);
    if (duplicateLookupError) throw duplicateLookupError;

    const normalizedOcr = ocrText.toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, " ").trim();
    const ocrTokens = new Set(normalizedOcr.split(/\\s+/).filter(token => token.length > 2));
    const matches = (existing || []).flatMap(row => {
      const exact = row.sha256 === sha256;
      const visualDistance = perceptualHash && row.perceptual_hash
        ? hammingDistance(perceptualHash, row.perceptual_hash)
        : 65;
      const priorText = String(row.ocr_text || "").toLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, " ").trim();
      const priorTokens = new Set(priorText.split(/\\s+/).filter(token => token.length > 2));
      let overlap = 0;
      for (const token of ocrTokens) if (priorTokens.has(token)) overlap++;
      const ocrSimilarity = ocrTokens.size && priorTokens.size
        ? overlap / new Set([...ocrTokens, ...priorTokens]).size
        : 0;
      const kind = exact ? "exact" : visualDistance <= 8 ? "visual" : ocrSimilarity >= 0.82 && ocrTokens.size >= 8 ? "ocr" : null;
      return kind ? [{ id: row.id as string, kind, distance: kind === "visual" ? visualDistance : 0 }]
        : [];
    }).slice(0, 30);
    const duplicateMatchIds = matches.map(match => match.id);

    const id = randomUUID();
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storagePath = `${participant.id}/${id}.${extension}`;
    const stored = await supabase.storage.from("certificates").upload(storagePath, bytes, {
      contentType: file.type, upsert: false,
    });
    if (stored.error) throw stored.error;

    const saved = await supabase.from("proof_submissions").insert({
      id, participant_id: participant.id, campaign_name: campaignName, country_code: countryCode,
      storage_path: storagePath, original_filename: file.name.slice(0, 255),
      mime_type: file.type, size_bytes: file.size, status: "counted",
      sha256, perceptual_hash: /^[a-f0-9]{16}$/.test(perceptualHash) ? perceptualHash : null,
      ocr_text: ocrText || null, duplicate_flag: matches.length > 0,
      duplicate_match_ids: duplicateMatchIds,
    }).select("id").single();

    if (saved.error) {
      await supabase.storage.from("certificates").remove([storagePath]);
      throw saved.error;
    }

    return NextResponse.json({
      ok: true, submissionId: saved.data.id, status: "counted",
      duplicateFlag: matches.length > 0, duplicateMatches: matches,
    });
  } catch (error) {
    console.error("Proof submission error:", error);
    return NextResponse.json({ error: "Could not save this proof. Please try again." }, { status: 500 });
  }
}
