import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";

export const maxDuration = 60;

const MAX_SIZE = 5 * 1024 * 1024;
const MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server configuration is incomplete.");
  return createClient(url, key);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const campaignName = String(form.get("campaignName") || "").trim();
    const username = String(form.get("username") || "").trim().replace(/^@/, "");
    const countryCode = String(form.get("countryCode") || "").trim().toUpperCase();
    const file = form.get("screenshots");

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
      .from("participants")
      .select("id")
      .eq("x_username", username)
      .maybeSingle();

    if (participantError) throw participantError;

    if (!participant) {
      const inserted = await supabase.from("participants")
        .insert({ x_username: username, country_code: countryCode })
        .select("id").single();

      if (inserted.error?.code === "23505") {
        const retry = await supabase.from("participants")
          .select("id").eq("x_username", username).single();
        if (retry.error) throw retry.error;
        participant = retry.data;
      } else if (inserted.error) {
        throw inserted.error;
      } else {
        participant = inserted.data;
      }
    }

    const id = randomUUID();
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storagePath = `${participant.id}/${id}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const imageSha256 = createHash("sha256").update(bytes).digest("hex");

    const stored = await supabase.storage.from("certificates").upload(storagePath, bytes, {
      contentType: file.type,
      upsert: false,
    });
    if (stored.error) throw stored.error;

    const saved = await supabase.from("proof_submissions").insert({
      id,
      participant_id: participant.id,
      campaign_name: campaignName,
      country_code: countryCode,
      storage_path: storagePath,
      original_filename: file.name.slice(0, 255),
      mime_type: file.type,
      size_bytes: file.size,
      image_sha256: imageSha256,
      status: "counted",
    }).select("id").single();

    if (saved.error) {
      await supabase.storage.from("certificates").remove([storagePath]);
      if (saved.error.code === "23505") {
        return NextResponse.json({ error: "This image has already been submitted. It was not counted again." }, { status: 409 });
      }
      throw saved.error;
    }

    return NextResponse.json({ ok: true, submissionId: saved.data.id, status: "counted", counted: true });
  } catch (error) {
    console.error("Proof submission error:", error);
    return NextResponse.json({ error: "Could not save this proof. Please try again." }, { status: 500 });
  }
}
