"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readProvidedApiKey = readProvidedApiKey;
exports.readExpectedApiKey = readExpectedApiKey;
exports.requireApiKey = requireApiKey;
function firstQueryValue(req, name) {
    const q = req.query;
    const v = q[name];
    if (typeof v === "string" && v !== "")
        return v;
    if (Array.isArray(v) && v.length > 0)
        return String(v[0]);
    return "";
}
function firstHeaderValue(req, lowerName) {
    const h = req.headers[lowerName];
    if (typeof h === "string" && h !== "")
        return h;
    if (Array.isArray(h) && h.length > 0)
        return String(h[0]);
    return "";
}
function stripBearerIfPresent(value) {
    const t = value.trim();
    const m = /^Bearer\s+(\S+)/i.exec(t);
    return m ? m[1].trim() : t;
}
/** Query (apiKey | apikey), x-api-key, or Authorization (optional Bearer). */
function collectProvidedApiKey(req) {
    const fromQuery = firstQueryValue(req, "apiKey") || firstQueryValue(req, "apikey");
    const xApiKey = firstHeaderValue(req, "x-api-key");
    const authRaw = firstHeaderValue(req, "authorization");
    const fromAuth = authRaw ? stripBearerIfPresent(authRaw) : "";
    return (fromQuery || xApiKey || fromAuth).toString().trim();
}
/** Same sources as requireApiKey. */
function readProvidedApiKey(req) {
    return collectProvidedApiKey(req);
}
function readExpectedApiKey() {
    let v = (process.env.API_KEY || "").toString().trim().replace(/^\uFEFF/, "");
    if (v.length >= 2 &&
        ((v.startsWith('"') && v.endsWith('"')) ||
            (v.startsWith("'") && v.endsWith("'")))) {
        v = v.slice(1, -1).trim();
    }
    return v;
}
function requireApiKey(req, res, next) {
    const rawPath = String(req.originalUrl || req.url || "");
    const pathOnly = rawPath.split("?")[0].toLowerCase();
    // Public / local-only paths only. All other routes (including POST /operator/execute) require x-api-key.
    if (pathOnly === "/cheeky/system/url" ||
        pathOnly.startsWith("/cheeky/system/url/") ||
        pathOnly === "/cheeky/webhooks/square" ||
        pathOnly.startsWith("/cheeky/webhooks/square/") ||
        pathOnly === "/api/square/webhook" ||
        pathOnly === "/operator/test-followup") {
        return next();
    }
    const provided = collectProvidedApiKey(req);
    const expected = readExpectedApiKey();
    console.log("AUTH DEBUG", { expected, provided });
    if (!provided || provided !== expected) {
        res.status(401).json({
            ok: false,
            success: false,
            stage: "auth",
            error: "Invalid API key"
        });
        return;
    }
    next();
}
