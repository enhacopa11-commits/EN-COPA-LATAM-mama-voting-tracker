import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminActor, isAdminAuthenticated } from "@/lib/admin-auth";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server configuration is incomplete.");
  return createClient(url, key);
}

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const supabase = db();
    const { data, error } = await supabase.from("proof_submissions")
      .select("id,campaign_name,country_code,storage_path,original_filename,mime_type,size_bytes,status,created_at,sha256,perceptual_hash,ocr_text,duplicate_flag,duplicate_match_ids,rejection_reason,rejected_at,rejected_by,participants(x_username)")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    const rows = await Promise.all((data || []).map(async row => {
      const { data: signed, error: signedError } = await supabase.storage.from("certificates")
        .createSignedUrl(row.storage_path, 60 * 10);
      if (signedError) console.error("Could not sign proof image", signedError);
      return { ...row, image_url: signed?.signedUrl || null };
    }));
    return NextResponse.json({ submissions: rows });
  } catch (error) {
    console.error("Admin submissions error:", error);
    return NextResponse.json({ error: "Could not load submissions. Check that the latest proof-submission migration has been applied." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { id, status, reason } = await request.json();
    if (typeof id !== "string" || !["counted", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid submission or status." }, { status: 400 });
    }
    if (status === "rejected" && (typeof reason !== "string" || reason.trim().length < 3 || reason.trim().length > 500)) {
      return NextResponse.json({ error: "Add a short reason for rejecting this image." }, { status: 400 });
    }

    const supabase = db();
    const { data: current, error: currentError } = await supabase
      .from("proof_submissions").select("id,status").eq("id", id).single();
    if (currentError) throw currentError;

    const actor = await getAdminActor();
    const { error: auditError } = await supabase.from("proof_submission_audit").insert({
      submission_id: id,
      previous_status: current.status,
      new_status: status,
      reason: status === "rejected" ? reason.trim() : null,
      admin_actor: actor,
    });
    if (auditError) throw auditError;

    const update = status === "rejected"
      ? { status, rejection_reason: reason.trim(), rejected_at: new Date().toISOString(), rejected_by: actor }
      : { status, rejection_reason: null, rejected_at: null, rejected_by: null };
    const { data, error } = await supabase.from("proof_submissions")
      .update(update).eq("id", id).select("id,status,rejection_reason,rejected_at,rejected_by").single();
    if (error) throw error;
    return NextResponse.json({ submission: data });
  } catch (error) {
    console.error("Admin status update error:", error);
    return NextResponse.json({ error: "Could not update this submission or write its audit record." }, { status: 500 });
  }
}
