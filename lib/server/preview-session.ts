import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "mylodge_preview";
export function signSession(id: string, expires: number, secret: string) {
  const payload = `${id}.${expires}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifySession(value: string | undefined, secret: string, now = Date.now()): string | null {
  if (!value || !secret) return null;
  const [id, expires, signature, extra] = value.split(".");
  if (extra || !/^[a-f0-9-]{36}$/.test(id) || !/^\d+$/.test(expires) || Number(expires) <= now || !signature) return null;
  const expected = signSession(id, Number(expires), secret).split(".")[2];
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}
