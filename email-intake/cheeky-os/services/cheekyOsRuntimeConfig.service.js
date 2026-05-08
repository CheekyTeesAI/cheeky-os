"use strict";

/**
 * CHEEKY OS v4.3 — Central runtime knobs (env reads per call).
 */

function getPackageVersion() {
  try {
    return String(require("../../package.json").version || "").trim();
  } catch (_) {
    return "";
  }
}

const PKG_VERSION = getPackageVersion();

function cheekyOsVersion() {
  return String(process.env.CHEEKY_OS_VERSION || PKG_VERSION || "4.3.0").trim();
}

function listenPort() {
  return Number(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000) || 3000;
}

function adminApiKey() {
  return String(process.env.CHEEKY_ADMIN_API_KEY || "").trim();
}

/** Optional separate dashboard key — falls back to admin key elsewhere. */
function dashboardApiKey() {
  const d = String(process.env.CHEEKY_DASHBOARD_API_KEY || "").trim();
  return d || adminApiKey();
}

/** api_key | entra | off */
function dashboardAuthMode() {
  const raw = String(process.env.CHEEKY_DASHBOARD_AUTH_MODE || "").trim().toLowerCase();
  if (raw === "off" || raw === "none" || raw === "false") return "off";
  if (raw === "entra" || raw === "azuread" || raw === "aad") return "entra";
  if (dashboardApiKey()) return "api_key";
  if (dashboardRequireAuth()) return "api_key";
  return "off";
}

function dashboardRequireAuth() {
  return !!String(process.env.CHEEKY_DASHBOARD_REQUIRE_AUTH || "").match(/^(1|true|on|yes)$/i);
}

function workerStateless() {
  return !!String(process.env.CHEEKY_WORKER_STATELESS || "").match(/^(1|true|on|yes)$/i);
}

function resolveDataverseProfileLabel() {
  return String(process.env.CHEEKY_DATAVERSE_PROFILE || "").trim() || "default";
}

/** Placeholders that must never ship to production unchanged. */
const BAD_SECRET_PATTERNS = [
  /^REPLACE_ME$/i,
  /^replace_me$/i,
  /^sk-test/i,
  /^cheeky-secret-123$/i,
];

function looksLikePlaceholder(secret) {
  const s = String(secret || "").trim();
  if (s.length < 12) return true;
  return BAD_SECRET_PATTERNS.some((re) => re.test(s));
}

function logV4StartupValidation() {
  const lines = validateV4Config();
  for (const l of lines.warnings) {
    console.warn(`[cheeky-v4] ${l}`);
  }
  for (const l of lines.infos) {
    console.log(`[cheeky-v4] ${l}`);
  }
  if (lines.critical?.length) {
    for (const c of lines.critical) {
      console.error(`[cheeky-v4] CRITICAL: ${c}`);
    }
    if (String(process.env.CHEEKY_STRICT_SECRETS || "").match(/^(1|true|on|yes)$/i)) {
      throw new Error("CHEEKY_STRICT_SECRETS: refuse to boot with placeholder or missing prod secrets");
    }
  }
  return lines;
}

function validateV4Config() {
  const warnings = [];
  const infos = [];
  /** @type {string[]} */
  const critical = [];
  const prod =
    String(process.env.NODE_ENV || "").toLowerCase() === "production" ||
    Boolean(String(process.env.RENDER || "").trim());

  const admin = adminApiKey();
  if (prod && !admin) {
    warnings.push("CHEEKY_ADMIN_API_KEY unset — POST /admin/* returns 503 until configured");
  } else if (!admin) {
    infos.push(
      "Admin API: set CHEEKY_ADMIN_API_KEY for POST /admin/restart-worker · /trigger-test-intake · /health"
    );
  }

  if (prod && dashboardRequireAuth()) {
    if (dashboardAuthMode() === "entra") {
      if (
        !String(process.env.CHEEKY_DASHBOARD_ENTRA_TENANT_ID || "").trim() ||
        !String(process.env.CHEEKY_DASHBOARD_ENTRA_AUDIENCE || "").trim()
      ) {
        critical.push(
          "CHEEKY_DASHBOARD_REQUIRE_AUTH + entra mode needs CHEEKY_DASHBOARD_ENTRA_TENANT_ID and CHEEKY_DASHBOARD_ENTRA_AUDIENCE"
        );
      }
    } else if (!dashboardApiKey()) {
      critical.push("CHEEKY_DASHBOARD_REQUIRE_AUTH=true but no CHEEKY_DASHBOARD_API_KEY nor CHEEKY_ADMIN_API_KEY");
    }
  }

  infos.push(`CHEEKY OS v${cheekyOsVersion()} config check complete (v4.3 Production Ready)`);

  const dvReady = Boolean(
    String(process.env.DATAVERSE_URL || "").trim() &&
      String(process.env.DATAVERSE_CLIENT_SECRET || "").trim()
  );
  if (!dvReady && String(process.env.WORKER_ENABLED || "").match(/^(1|true|on|yes)$/i)) {
    warnings.push("WORKER_ENABLED but Dataverse incomplete — worker will idle");
  }

  if (workerStateless()) {
    infos.push(
      "CHEEKY_WORKER_STATELESS=true — prefer single replica; horizontal scale relies on dedupe ring only"
    );
  }

  if (prod && process.env.CHEEKY_DATAVERSE_PROFILE) {
    infos.push(`Dataverse profile active: CHEEKY_DATAVERSE_PROFILE=${resolveDataverseProfileLabel()}`);
  }

  const sqTok = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  if (prod && sqTok && looksLikePlaceholder(sqTok)) {
    critical.push("SQUARE_ACCESS_TOKEN looks like placeholder — set real credential");
    warnings.push("Square token appears placeholder-ish");
  }
  const oai = String(process.env.OPENAI_API_KEY || "").trim();
  if (prod && oai && oai.startsWith("sk-proj-placeholder")) {
    warnings.push("OPENAI_API_KEY resembles placeholder");
  }

  const chat = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
  if (prod && chat && chat.length < 24) {
    warnings.push("CHATGPT_ACTION_API_KEY very short — verify");
  }

  return { warnings, infos, critical };
}

module.exports = {
  cheekyOsVersion,
  listenPort,
  adminApiKey,
  dashboardApiKey,
  dashboardAuthMode,
  dashboardRequireAuth,
  workerStateless,
  resolveDataverseProfileLabel,
  validateV4Config,
  logV4StartupValidation,
};
