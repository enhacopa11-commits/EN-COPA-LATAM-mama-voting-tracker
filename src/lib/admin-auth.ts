import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "encopa_admin_session";
const SESSION_SECONDS = 60 * 60 * 12;

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createAdminToken() {
  const payload = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return payload + "." + signature(payload);
}

export function isValidAdminToken(token?: string) {
  if (!token) return false;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied || !/^\d+$/.test(payload)) return false;
  if (Number(payload) < Math.floor(Date.now() / 1000)) return false;
  const expected = signature(payload);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdminAuthenticated() {
  const jar = await cookies();
  return isValidAdminToken(jar.get(COOKIE_NAME)?.value);
}

export const adminCookie = {
  name: COOKIE_NAME,
  maxAge: SESSION_SECONDS,
};
