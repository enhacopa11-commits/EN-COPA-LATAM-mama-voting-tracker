import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";


function kstDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Server configuration is incomplete.");

    const supabase = createClient(url, key);
    const today = kstDate();

    const { data, error } = await supabase
      .from("certificates")
      .select("participant_id, upload_date_kst, status, participants!inner(x_username,country_code)")
      .in("status", ["pending", "verified"]);

    if (error) throw error;

    const users = new Map<string, { username: string; countryCode: string; daily: number; overall: number }>();
    const countries = new Map<string, { countryCode: string; daily: number; overall: number }>();

    for (const item of data || []) {
      const participant = item.participants as unknown as { x_username: string; country_code: string };
      const isToday = item.upload_date_kst === today;

      const user = users.get(item.participant_id) || {
        username: participant.x_username,
        countryCode: participant.country_code,
        daily: 0,
        overall: 0,
      };
      user.overall += 1;
      if (isToday) user.daily += 1;
      users.set(item.participant_id, user);

      const country = countries.get(participant.country_code) || {
        countryCode: participant.country_code,
        daily: 0,
        overall: 0,
      };
      country.overall += 1;
      if (isToday) country.daily += 1;
      countries.set(participant.country_code, country);
    }

    const sort = <T extends { daily: number; overall: number }>(items: T[]) => ({
      daily: [...items].sort((a, b) => b.daily - a.daily),
      overall: [...items].sort((a, b) => b.overall - a.overall),
    });

    return NextResponse.json({
      dateKST: today,
      countries: sort([...countries.values()]),
      users: sort([...users.values()]),
      totalToday: (data || []).filter(x => x.upload_date_kst === today).length,
      totalOverall: (data || []).length,
    });
  } catch (error) {
    console.error("Rankings API error:", error);
    return NextResponse.json({ error: "Could not load real rankings." }, { status: 500 });
  }
}
