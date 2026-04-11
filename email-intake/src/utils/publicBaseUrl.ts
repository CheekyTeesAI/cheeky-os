import type { Request } from "express";

/** Best-effort public URL from reverse proxy (ngrok) headers. */
export function publicBaseUrl(req: Request): string {
  const raw = req.headers["x-forwarded-proto"];
  const xfProto = Array.isArray(raw)
    ? raw[0]
    : typeof raw === "string"
      ? raw.split(",")[0]?.trim()
      : undefined;
  const proto = (xfProto || req.protocol || "http").replace(/:+$/, "");
  const host = (req.headers.host || "").trim();
  if (!host) {
    return `${proto}://localhost`;
  }
  return `${proto}://${host}`;
}
