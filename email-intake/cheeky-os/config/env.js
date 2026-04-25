/**
 * Central env reads for cheeky-os server (no secrets logged).
 */

function truthy(v) {
  return String(v || "")
    .trim()
    .toLowerCase() === "true";
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
  };
}

function logReadinessLines() {
  const r = getReadiness();
  console.log(
    `[boot] readiness openai=${r.openai ? "yes" : "no"} model=${r.openaiModel} square=${r.square ? "yes" : "no"} squareWebhookSig=${r.squareWebhookSig ? "yes" : "no"} db=${r.databaseUrl ? "yes" : "no"} digest=${r.digestEnabled ? "on" : "off"}`
  );
}

/**
 * When STRICT_ENV=true, warn if production-like and Square token missing.
 */
function warnStrictEnv() {
  const strict = truthy(process.env.STRICT_ENV);
  if (!strict) return;
  const r = getReadiness();
  const prodLike =
    String(process.env.NODE_ENV || "").toLowerCase() === "production" ||
    Boolean(String(process.env.RENDER || "").trim());
  if (prodLike && !r.square) {
    console.warn(
      "[boot] STRICT_ENV: SQUARE_ACCESS_TOKEN/SQUARE_LOCATION_ID recommended for production"
    );
  }
}

module.exports = {
  getReadiness,
  logReadinessLines,
  warnStrictEnv,
};
