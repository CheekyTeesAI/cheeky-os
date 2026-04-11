"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicBaseUrl = publicBaseUrl;
/** Best-effort public URL from reverse proxy (ngrok) headers. */
function publicBaseUrl(req) {
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
