import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Server configuration is incomplete.");

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("proof_submissions")
      .select("participant_id,country_code,status,participants(x_username)")
      .neq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(10000);
    if (error) throw error;

    const people = new Map<string, { username: string; country: string; count: number }>();
    const countries = new Map<string, number>();
    for (const row of data || []) {
      const participant = Array.isArray(row.participants) ? row.participants[0] : row.participants;
      const username = participant?.x_username || "Unknown";
      const country = String(row.country_code || "ZZ").trim().toUpperCase();
      const current = people.get(row.participant_id) || { username, country, count: 0 };
      current.count += 1;
      people.set(row.participant_id, current);
      countries.set(country, (countries.get(country) || 0) + 1);
    }

    const individual = [...people.values()]
      .sort((a, b) => b.count - a.count || a.username.localeCompare(b.username))
      .map((item, index) => ({ rank: index + 1, ...item }));
    const byCountry = [...countries.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
      .map((item, index) => ({ rank: index + 1, ...item }));

    return NextResponse.json({
      individual,
      countries: byCountry,
      total: (data || []).length,
      provisional: (data || []).filter(row => row.status === "pending_review").length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Public rankings error:", error);
    return NextResponse.json({ error: "Rankings are temporarily unavailable." }, { status: 500 });
  }
}
