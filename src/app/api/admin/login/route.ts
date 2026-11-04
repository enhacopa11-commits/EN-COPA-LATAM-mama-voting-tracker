import { NextResponse } from "next/server";
import { createAdminToken, adminCookie } from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const { password, adminName } = await request.json();
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return NextResponse.json({ error: "Admin access is not configured." }, { status: 503 });
    if (typeof password !== "string" || password.length > 200 || password !== expected) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    if (typeof adminName !== "string" || adminName.trim().length < 2 || adminName.trim().length > 60) {
      return NextResponse.json({ error: "Enter your admin name so review actions can be recorded." }, { status: 400 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminCookie.name, createAdminToken(adminName.trim()), {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "strict", path: "/", maxAge: adminCookie.maxAge,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
