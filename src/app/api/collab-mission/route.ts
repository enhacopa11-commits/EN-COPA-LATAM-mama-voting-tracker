import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GOALS = { mnet_plus: 10000, mma: 5000 } as const;
type Platform = keyof typeof GOALS;

function kstDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = db();
    const today = kstDate();
    const { data, error } = await supabase
      .from("certificates")
      .select("participant_id,platform,upload_date_kst,participants!inner(x_username,country_code)")
      .eq("artist", "CORTIS")
      .in("status", ["pending", "verified"]);
    if (error) throw error;

    const totals: Record<Platform, number> = { mnet_plus: 0, mma: 0 };
    const users = new Map<string, {
      username: string;
      countryCode: string;
      mnetPlusVotes: number;
      mmaVotes: number;
    }>();

    for (const row of data || []) {
      const platform = row.platform as Platform | null;
      if (platform !== "mnet_plus" && platform !== "mma") continue;
      totals[platform] += 1;

      const participant = row.participants as unknown as {
        x_username: string;
        country_code: string;
      };
      const user = users.get(row.participant_id) || {
        username: participant.x_username,
        countryCode: participant.country_code,
        mnetPlusVotes: 0,
        mmaVotes: 0,
      };

      if (platform === "mnet_plus") user.mnetPlusVotes += 1;
      else user.mmaVotes += 1;
      users.set(row.participant_id, user);
    }

    const ranking = [...users.values()]
      .sort((a, b) =>
        (b.mnetPlusVotes + b.mmaVotes) - (a.mnetPlusVotes + a.mmaVotes)
      )
      .slice(0, 100);

    return NextResponse.json({
      dateKST: today,
      goals: GOALS,
      totals,
      progress: {
        mnet_plus: Math.min(100, totals.mnet_plus / GOALS.mnet_plus * 100),
        mma: Math.min(100, totals.mma / GOALS.mma * 100),
      },
      ranking,
      totalParticipants: users.size,
    });
  } catch (error) {
    console.error("Collab mission GET:", error);
    return NextResponse.json(
      { error: "Could not load collaboration progress." },
      { status: 500 }
    );
  }
}

// All certificates use the main OCR submission form; manual vote totals are disabled.
export async function POST() {
  return NextResponse.json(
    { error: "Submit certificates through the main form. Artist and platform are detected automatically." },
    { status: 410 }
  );
}
