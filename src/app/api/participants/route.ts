import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const { username, countryCode } = await request.json();

    if (
      typeof username !== "string" ||
      typeof countryCode !== "string" ||
      !/^[A-Za-z0-9_]{1,15}$/.test(username.replace(/^@/, "")) ||
      !/^[A-Z]{2}$/.test(countryCode)
    ) {
      return NextResponse.json(
        { error: "Invalid username or country." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !secretKey) {
      return NextResponse.json(
        { error: "Server configuration is incomplete." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, secretKey);

    const { data, error } = await supabase
      .from("participants")
      .insert({
        x_username: username.replace(/^@/, ""),
        country_code: countryCode,
      })
      .select("id, x_username, country_code, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This X username is already registered." },
          { status: 409 }
        );
      }

      console.error("Participant registration error:", error);

      return NextResponse.json(
        { error: "Could not register participant." },
        { status: 500 }
      );
    }

    return NextResponse.json({ participant: data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 }
    );
  }
}
