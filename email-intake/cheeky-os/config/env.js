/**
 * Central env reads for cheeky-os server (no secrets logged).
 */

function truthy(v) {
  return String(v || "")
    .trim()
    .toLowerCase() === "true";
}

/** Coarse booleans — accepts `1`, `on`, `yes` (WORKER_ENABLED, etc.). */
function envToggleOn(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "on" || s === "yes";
}

function getReadiness() {
  const openai = Boolean(String(process.env.OPENAI_API_KEY || "").trim());
  const square =
    Boolean(String(process.env.SQUARE_ACCESS_TOKEN || "").trim()) &&
    Boolean(String(process.env.SQUARE_LOCATION_ID || "").trim());
  const squareWebhookSig = Boolean(
    String(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "").trim()
  );
  const db = Boolean(String(process.env.DATABASE_URL || "").trim());
  return {
    openai,
    openaiModel: String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim(),
    square,
    squareWebhookSig,
    squareSkipVerify: truthy(process.env.SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY),
    databaseUrl: db,
    digestEnabled: truthy(process.env.DAILY_DIGEST_ENABLED),
    /** Controlled pilot: real Square deposits → orders; no extra automation — see PILOT_MODE notes in .env.example */
    pilotMode: truthy(process.env.CHEEKY_PILOT_MODE),
  };
}

function logReadinessLines() {
  const r = getReadiness();
  console.log(
    `[boot] readiness openai=${r.openai ? "yes" : "no"} model=${r.openaiModel} square=${r.square ? "yes" : "no"} squareWebhookSig=${r.squareWebhookSig ? "yes" : "no"} db=${r.databaseUrl ? "yes" : "no"} digest=${r.digestEnabled ? "on" : "off"} pilotMode=${r.pilotMode ? "CHEEKY_PILOT_MODE=true" : "off"}`
  );
}

/**
 * When STRICT_ENV=true, warn if production-like and Square token missing.
 */
function warnStrictEnv() {
  const strict = truthy(process.env.STRICT_ENV);
  const prodLike =
    String(process.env.NODE_ENV || "").toLowerCase() === "production" ||
    Boolean(String(process.env.RENDER || "").trim());
  for (const a of getProductionIntegrationAlerts(prodLike)) {
    console.warn("[boot]" + " " + a);
  }

  if (!strict) return;
  const r = getReadiness();
  if (prodLike && !r.square) {
    console.warn(
      "[boot] STRICT_ENV: SQUARE_ACCESS_TOKEN/SQUARE_LOCATION_ID recommended for production"
    );
  }
}

/**
 * Operational warnings when optional subsystems contradict env flags (v3.2).
 */
function getProductionIntegrationAlerts(prodLike) {
  const out = [];
  const dvReady = Boolean(
    String(process.env.DATAVERSE_URL || "").trim() &&
      String(process.env.DATAVERSE_CLIENT_ID || "").trim() &&
      String(process.env.DATAVERSE_CLIENT_SECRET || "").trim() &&
      String(process.env.DATAVERSE_TENANT_ID || "").trim()
  );
  if (envToggleOn(process.env.WORKER_ENABLED) && !dvReady) {
    out.push("WORKER_ENABLED=true but DATAVERSE_* incomplete — autonomous operator idle");
  }
  if (
    envToggleOn(process.env.WORKER_ENABLED) &&
    prodLike &&
    !String(process.env.OPENAI_API_KEY || "").trim()
  ) {
    out.push(
      "WORKER_ENABLED=true in production but OPENAI_API_KEY empty — INTAKE_NEW rows won't parse automatically"
    );
  }
  if (prodLike && !dvReady && String(process.env.CHEEKY_CT_INTAKE_GATE_STRICT || "").toLowerCase() !== "false") {
    out.push(
      "Production-like mode without DATAVERSE_* — CHEEKY_CT_INTAKE_GATE_STRICT may force deposit gate skips"
    );
  }
  return out;
}

module.exports = {
  getReadiness,
  logReadinessLines,
  warnStrictEnv,
  truthy,
  envToggleOn,
  getProductionIntegrationAlerts,
};
