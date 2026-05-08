"use strict";

/**
 * CHEEKY OS v4.1 — Dashboard + admin surface auth.
 *
 * CHEEKY_DASHBOARD_AUTH_MODE=api_key | entra | off
 *   default: api_key when CHEEKY_DASHBOARD_API_KEY set, else off in dev — require in prod via CHEEKY_DASHBOARD_REQUIRE_AUTH=true
 * CHEEKY_DASHBOARD_ALLOW_QUERY_KEY=true — allow ?dk=… for HTML dashboard (risky)
 *
 * Entra / Microsoft Entra ID:
 *   CHEEKY_DASHBOARD_ENTRA_TENANT_ID=<guid>
 *   CHEEKY_DASHBOARD_ENTRA_AUDIENCE=<API app registration client ID or URI>
 */

const { recordAdminAudit } = require("./cheekyOsAdminAudit.service");
const {
  dashboardAuthMode,
  dashboardRequireAuth,
  dashboardApiKey,
} = require("./cheekyOsRuntimeConfig.service");

const DASH_HEADER = "x-cheeky-dashboard-key";

function clientIp(req) {
  const x = req.get?.("x-forwarded-for") || req.headers?.["x-forwarded-for"];
  return String(x || req.socket?.remoteAddress || "").split(",")[0].trim();
}

async function validateEntraBearer(token) {
  const tenant = String(process.env.CHEEKY_DASHBOARD_ENTRA_TENANT_ID || "").trim();
  const audience = String(process.env.CHEEKY_DASHBOARD_ENTRA_AUDIENCE || "").trim();
  if (!tenant || !audience) return { ok: false, reason: "entra_env_incomplete" };
  try {
    const jwt = require("jsonwebtoken");
    const jwksClient = require("jwks-rsa");
    const client = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
      cache: true,
      rateLimit: true,
    });
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) return { ok: false, reason: "bad_token" };
    const key = await client.getSigningKey(decoded.header.kid);
    const signingKey = key.getPublicKey();
    jwt.verify(token, signingKey, {
      audience,
      issuer: [`https://login.microsoftonline.com/${tenant}/v2.0`, `https://sts.windows.net/${tenant}/`],
      algorithms: ["RS256"],
    });
    return { ok: true, sub: decoded.payload?.sub || "entra" };
  } catch (e) {
    return { ok: false, reason: e && e.message ? e.message : "verify_failed" };
  }
}

function extractApiKey(req) {
  const h = req.get?.(DASH_HEADER) || req.headers?.[DASH_HEADER];
  if (h && String(h).trim()) return String(h).trim();
  const auth = String(req.get?.("authorization") || req.headers?.authorization || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) return m[1].trim();
  if (String(process.env.CHEEKY_DASHBOARD_ALLOW_QUERY_KEY || "").match(/^(1|true|on|yes)$/i)) {
    const q = req.query?.dk != null ? String(req.query.dk) : "";
    if (q.trim()) return q.trim();
  }
  return "";
}

function authRequired() {
  const mode = dashboardAuthMode();
  if (mode === "off") return false;
  if (mode === "entra") return true;
  const key = dashboardApiKey();
  if (key) return true;
  if (dashboardRequireAuth()) return true;
  return false;
}

async function requireDashboardAuth(req, res, next) {
  if (!authRequired()) return next();

  const mode = dashboardAuthMode();
  const ip = clientIp(req);

  if (mode === "entra") {
    const auth = String(req.get?.("authorization") || "");
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      res.status(401).set("WWW-Authenticate", 'Bearer realm="cheeky-dashboard"').send("Unauthorized");
      return;
    }
    const v = await validateEntraBearer(m[1].trim());
    if (!v.ok) {
      recordAdminAudit({ action: "dashboard_auth_fail", actor: "entra", ip, meta: { reason: v.reason } });
      res.status(401).json({ ok: false, error: "unauthorized", detail: v.reason });
      return;
    }
    req.cheekyAuth = { type: "entra", sub: v.sub };
    return next();
  }

  const expected = dashboardApiKey() || String(process.env.CHEEKY_ADMIN_API_KEY || "").trim();
  if (!expected) {
    res.status(503).json({
      ok: false,
      error: "dashboard_auth_misconfigured",
      detail: "Set CHEEKY_DASHBOARD_API_KEY or CHEEKY_ADMIN_API_KEY",
    });
    return;
  }
  const got = extractApiKey(req);
  const fromQuery =
    !!String(process.env.CHEEKY_DASHBOARD_ALLOW_QUERY_KEY || "").match(/^(1|true|on|yes)$/i) &&
    req.query &&
    req.query.dk != null &&
    String(req.query.dk).trim();

  if (got !== expected) {
    recordAdminAudit({ action: "dashboard_auth_fail", actor: "api_key", ip, meta: {} });
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  req.cheekyAuth = { type: "api_key" };
  req.cheekDashboardFetchKeyEcho = fromQuery && got === expected ? got : "";
  next();
}

module.exports = {
  requireDashboardAuth,
  extractApiKey,
  authRequired,
  clientIp,
};
