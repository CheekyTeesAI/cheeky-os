/**
 * App version and build metadata (no secrets).
 */
const fs = require("fs");
const path = require("path");

const STARTED_AT = new Date().toISOString();

function readPackageVersion() {
  const candidates = [
    path.join(process.cwd(), "package.json"),
    path.join(process.cwd(), "..", "package.json"),
    path.join(__dirname, "..", "..", "email-intake", "package.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, "utf8") || "{}");
        if (j && j.version) return String(j.version);
      }
    } catch (_e) {
      /* continue */
    }
  }
  return "unknown";
}

function getBuildInfo() {
  const nodeEnv = process.env.NODE_ENV || "development";
  return {
    appName: "Cheeky OS",
    version: readPackageVersion(),
    environment: nodeEnv,
    startedAt: STARTED_AT,
    buildMode: nodeEnv === "production" ? "production" : "development",
    features: {
      databaseUrl: Boolean(String(process.env.DATABASE_URL || "").trim()),
      foundationDb: Boolean(String(process.env.FOUNDATION_DATABASE_URL || "").trim()),
      square: Boolean(String(process.env.SQUARE_ACCESS_TOKEN || "").trim()),
      emailOutbound: Boolean(String(process.env.RESEND_API_KEY || "").trim()),
      sms: Boolean(
        String(process.env.TWILIO_ACCOUNT_SID || "").trim() &&
          String(process.env.TWILIO_AUTH_TOKEN || "").trim()
      ),
      graph: Boolean(
        String(process.env.AZURE_TENANT_ID || "").trim() &&
          String(process.env.AZURE_CLIENT_ID || "").trim()
      ),
    },
  };
}

module.exports = {
  getBuildInfo,
  STARTED_AT,
};
