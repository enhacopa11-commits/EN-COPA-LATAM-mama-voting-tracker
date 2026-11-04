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
    if (typeof id !== "string" || !["pending_review", "reviewed", "approved", "rejected"].includes(status)) {
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
