"use strict";

/**
 * CHEEKY_TRANSPORT_KEY — local orchestration ingress guard only.
 */

function maskedLen(n) {
  try {
    return typeof n === "number" ? n > 0 : false;
  } catch (_e) {
    return false;
  }
}

function normalizeKeyProvided(req) {
  try {
    const h = req.get("x-cheeky-transport-key");
    if (h && String(h).trim()) return String(h).trim();
    const auth = req.get("authorization") || "";
    const m = /^Bearer\s+(\S+)/i.exec(auth);
    if (m && m[1]) return String(m[1]).trim();
    return "";
  } catch (_e) {
    return "";
  }
}

function transportAuth(req, res, next) {
  try {
    const expectedRaw = process.env.CHEEKY_TRANSPORT_KEY;
    const expected = String(expectedRaw != null ? expectedRaw : "").trim();
    const provided = normalizeKeyProvided(req);

    if (!expected) {
      return res.status(503).json({
        success: false,
        error: "transport_guard_not_configured",
        hintKeyPresent: maskedLen(process.env.CHEEKY_TRANSPORT_KEY != null ? 1 : 0),
      });
    }

    if (!provided || provided !== expected) {
      return res.status(401).json({ success: false, error: "invalid_or_missing_transport_key" });
    }

    next();
    return undefined;
  } catch (_e) {
    return res.status(401).json({ success: false, error: "transport_auth_error" });
  }
}

module.exports = {
  transportAuth,
};
