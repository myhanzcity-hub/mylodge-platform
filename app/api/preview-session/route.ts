import { cookies } from "next/headers";
import { SESSION_COOKIE, signSession } from "../../../lib/server/preview-session";

export async function GET(request: Request) {
  if (process.env.MYLODGE_RUNTIME !== "vercel") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const target = url.searchParams.get("return_to") || "/my";
  const safe = target.startsWith("/") && !target.startsWith("//") && !target.includes("\\") ? target : "/my";
  const secret = process.env.MYLODGE_PREVIEW_SESSION_SECRET;
  if (!secret) return new Response("Preview session unavailable", { status: 503 });
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  const { verifySession } = await import("../../../lib/server/preview-session");
  const id = verifySession(existing, secret) || crypto.randomUUID();
  jar.set(SESSION_COOKIE, signSession(id, Date.now() + 30 * 86400000, secret), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
  return new Response(null, { status: 303, headers: { Location: safe, "Cache-Control": "no-store" } });
}
