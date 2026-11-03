import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const GOALS = {
  mnet_plus: 10000,
  mma: 5000,
} as const;

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

  if (!url || !key) {
    throw new Error("Supabase server configuration is incomplete.");
  }

  return createClient(url, key);
}

export async function GET() {
  try {
    const supabase = db();
    const today = kstDate();

    const { data, error } = await supabase
      .from("collab_submissions")
      .select(
        "participant_id,platform,votes,participants!inner(x_username,country_code)"
      )
      .eq("submission_date_kst", today);

    if (error) throw error;

    const totals = { mnet_plus: 0, mma: 0 };

    const users = new Map<
      string,
      {
        username: string;
        countryCode: string;
        mnetPlusVotes: number;
        mmaVotes: number;
      }
    >();

    for (const row of data || []) {
      const platform = row.platform as Platform;
      totals[platform] += row.votes;

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

      if (platform === "mnet_plus") {
        user.mnetPlusVotes += row.votes;
      } else {
        user.mmaVotes += row.votes;
      }

      users.set(row.participant_id, user);
    }

    const ranking = [...users.values()]
      .sort(
        (a, b) =>
          b.mnetPlusVotes + b.mmaVotes -
          (a.mnetPlusVotes + a.mmaVotes)
      )
      .slice(0, 100);

    return NextResponse.json({
      dateKST: today,
      goals: GOALS,
      totals,
      progress: {
        mnet_plus: Math.min(100, (totals.mnet_plus / GOALS.mnet_plus) * 100),
        mma: Math.min(100, (totals.mma / GOALS.mma) * 100),
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

export async function POST(request: Request) {
  let storagePath = "";
  let supabase: ReturnType<typeof db> | null = null;

  try {
    supabase = db();

    const form = await request.formData();
    const username = String(form.get("username") || "")
      .trim()
      .replace(/^@/, "");
    const countryCode = String(form.get("countryCode") || "").toUpperCase();
    const platform = String(form.get("platform") || "") as Platform;
    const votes = Number(form.get("votes"));
    const file = form.get("proof");

    if (
      !/^[A-Za-z0-9_]{1,15}$/.test(username) ||
      !/^[A-Z]{2}$/.test(countryCode)
    ) {
      return NextResponse.json(
        { error: "Invalid X username or country." },
        { status: 400 }
      );
    }

    if (
      !(platform in GOALS) ||
      !Number.isInteger(votes) ||
      votes < 1 ||
      votes > GOALS[platform]
    ) {
      return NextResponse.json(
        { error: "Enter a valid contribution amount." },
        { status: 400 }
      );
    }

    if (
      !(file instanceof File) ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size < 1 ||
      file.size > 5 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: "Upload one PNG, JPG or WebP image (max 5 MB)." },
        { status: 400 }
      );
    }

    let { data: participant, error } = await supabase
      .from("participants")
      .select("id")
      .ilike("x_username", username)
      .maybeSingle();

    if (error) throw error;

    if (!participant) {
      const created = await supabase
        .from("participants")
        .insert({
          x_username: username,
          country_code: countryCode,
        })
        .select("id")
        .single();

      if (created.error?.code === "23505") {
        const retry = await supabase
          .from("participants")
          .select("id")
          .ilike("x_username", username)
          .single();

        if (retry.error) throw retry.error;
        participant = retry.data;
      } else if (created.error) {
        throw created.error;
      } else {
        participant = created.data;
      }
    }

    const extension =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";

    storagePath = `collab/${participant.id}/${randomUUID()}.${extension}`;

    const upload = await supabase.storage
      .from("certificates")
      .upload(
        storagePath,
        Buffer.from(await file.arrayBuffer()),
        {
          contentType: file.type,
          upsert: false,
        }
      );

    if (upload.error) throw upload.error;

    const saved = await supabase.from("collab_submissions").insert({
      participant_id: participant.id,
      platform,
      votes,
      submission_date_kst: kstDate(),
      storage_path: storagePath,
      original_filename: file.name.slice(0, 255),
    });

    if (saved.error) {
      await supabase.storage.from("certificates").remove([storagePath]);
      storagePath = "";

      if (saved.error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "You already submitted this platform today. One entry per platform per day.",
          },
          { status: 409 }
        );
      }

      throw saved.error;
    }

    return NextResponse.json(
      {
        ok: true,
        message: "Contribution recorded for today's community challenge.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Collab mission POST:", error);

    if (supabase && storagePath) {
      await supabase.storage.from("certificates").remove([storagePath]);
    }

    return NextResponse.json(
      { error: "Could not record this contribution." },
      { status: 500 }
    );
  }
}
