import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdminAuthenticated } from "@/lib/admin-auth";

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
      .select("id,campaign_name,country_code,storage_path,original_filename,mime_type,size_bytes,status,created_at,participants(x_username)")
      .order("created_at", { ascending: false }).limit(300);
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
    return NextResponse.json({ error: "Could not load submissions. Check that the proof_submissions table and private storage bucket exist." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { id, status } = await request.json();
    if (typeof id !== "string" || !["pending_review", "counted", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid submission or status." }, { status: 400 });
    }
    const { data, error } = await db().from("proof_submissions")
      .update({ status }).eq("id", id).select("id,status").single();
    if (error) throw error;
    return NextResponse.json({ submission: data });
  } catch (error) {
    console.error("Admin status update error:", error);
    return NextResponse.json({ error: "Could not update this submission." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let stage = "initialization";
  try {
    stage = "reading request";
    const { id } = await request.json();
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "Invalid submission ID." }, { status: 400 });
    }

    stage = "connecting to Supabase";
    const supabase = db();

    stage = "finding submission";
    const { data: submission, error: lookupError } = await supabase
      .from("proof_submissions")
      .select("id,storage_path,status")
      .eq("id", id)
      .single();
    if (lookupError) throw lookupError;

    if (submission.status !== "rejected") {
      return NextResponse.json({ error: "Only rejected submissions can be permanently deleted. Reject counted submissions first." }, { status: 409 });
    }

    stage = "deleting database record";
    const { data: deletedRows, error: deleteRowError } = await supabase
      .from("proof_submissions")
      .delete()
      .eq("id", id)
      .eq("status", "rejected")
      .select("id");
    if (deleteRowError) throw deleteRowError;
    if (!deletedRows?.length) {
      return NextResponse.json({ error: "No record was deleted. Refresh the admin panel and try again." }, { status: 409 });
    }

    stage = "deleting image from Storage";
    const { error: storageError } = await supabase.storage
      .from("certificates")
      .remove([submission.storage_path]);
    if (storageError) {
      console.error("Submission row deleted but storage cleanup failed:", storageError);
      return NextResponse.json({ ok: true, warning: "Record deleted, but the stored image could not be removed automatically." });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Admin submission delete error:", { stage, detail, error });
    return NextResponse.json({
      error: "Delete failed during: " + stage + ". " + detail,
    }, { status: 500 });
  }
}
