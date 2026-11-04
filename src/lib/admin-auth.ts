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
export function createAdminToken(actor = "EN-COPA Admin") {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const safeActor = encodeURIComponent(actor.trim().slice(0, 60) || "EN-COPA Admin");
  const payload = expiry + ":" + safeActor;
  return payload + "." + signature(payload);
}
export function isValidAdminToken(token?: string) {
  if (!token) return false;
  const separator = token.lastIndexOf(".");
  if (separator < 0) return false;
  const payload = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  const [expiry] = payload.split(":");
  if (!expiry || !/^\d+$/.test(expiry) || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  const expected = signature(payload);
  const a = Buffer.from(supplied), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function isAdminAuthenticated() {
  const jar = await cookies();
  return isValidAdminToken(jar.get(COOKIE_NAME)?.value);
}
export async function getAdminActor() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!isValidAdminToken(token)) return "EN-COPA Admin";
  try {
    const payload = token!.slice(0, token!.lastIndexOf("."));
    return decodeURIComponent(payload.split(":").slice(1).join(":")) || "EN-COPA Admin";
  } catch { return "EN-COPA Admin"; }
}
export const adminCookie = { name: COOKIE_NAME, maxAge: SESSION_SECONDS };
