import { NextResponse } from "next/server";
import { createAdminToken, adminCookie } from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return NextResponse.json({ error: "El acceso administrativo todavía no está configurado en Vercel." }, { status: 503 });
    }
    if (typeof password !== "string" || password.length > 200 || password !== expected) {
      return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set(adminCookie.name, createAdminToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: adminCookie.maxAge,
    });
    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json({ error: "No se pudo iniciar sesión. Verifica la configuración del panel." }, { status: 500 });
  }
}
