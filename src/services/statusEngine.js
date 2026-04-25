const fs = require("fs");
const path = require("path");

function hasEnv(key) {
  return Boolean(String(process.env[key] || "").trim());
}

function uploadsDirExists() {
  try {
    const candidates = [
      path.resolve(process.cwd(), "uploads"),
      path.resolve(process.cwd(), "data"),
    ];
    return candidates.some((p) => {
      try { return fs.existsSync(p); } catch (_e) { return false; }
    });
  } catch (_e) {
    return false;
  }
}

function getSystemStatus() {
  try {
    const squareConnected = hasEnv("SQUARE_ACCESS_TOKEN");
    const openaiConnected = hasEnv("OPENAI_API_KEY");
    const resendConnected = hasEnv("RESEND_API_KEY");
    const twilioConnected = hasEnv("TWILIO_ACCOUNT_SID") && hasEnv("TWILIO_AUTH_TOKEN");
    const graphConnected = hasEnv("AZURE_TENANT_ID") && hasEnv("AZURE_CLIENT_ID") && hasEnv("AZURE_CLIENT_SECRET");
    const storageReady = uploadsDirExists();

    const dataConnected = {
      square: squareConnected,
      email_inbound: graphConnected,
      email_outbound: resendConnected,
      sms: twilioConnected,
      ai: openaiConnected,
      storage: storageReady,
    };

    const mockMode = !squareConnected;

    let health = "OK";
    if (!squareConnected) health = "DEGRADED";
    if (!storageReady) health = "DEGRADED";
    if (!squareConnected && !resendConnected && !openaiConnected) health = "CRITICAL";

    const missingKeys = [];
    if (!squareConnected) missingKeys.push("SQUARE_ACCESS_TOKEN");
    if (!openaiConnected) missingKeys.push("OPENAI_API_KEY");
    if (!resendConnected) missingKeys.push("RESEND_API_KEY");
    if (!twilioConnected) {
      if (!hasEnv("TWILIO_ACCOUNT_SID")) missingKeys.push("TWILIO_ACCOUNT_SID");
      if (!hasEnv("TWILIO_AUTH_TOKEN")) missingKeys.push("TWILIO_AUTH_TOKEN");
    }
    if (!graphConnected) {
      if (!hasEnv("AZURE_TENANT_ID")) missingKeys.push("AZURE_TENANT_ID");
      if (!hasEnv("AZURE_CLIENT_ID")) missingKeys.push("AZURE_CLIENT_ID");
      if (!hasEnv("AZURE_CLIENT_SECRET")) missingKeys.push("AZURE_CLIENT_SECRET");
    }
    if (!storageReady) missingKeys.push("UPLOADS_DIR");

    return {
      health,
      dataConnected,
      mockMode,
      missingKeys,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[statusEngine] getSystemStatus failed:", error && error.message ? error.message : error);
    return {
      health: "DEGRADED",
      dataConnected: { square: false, email_inbound: false, email_outbound: false, sms: false, ai: false, storage: false },
      mockMode: true,
      missingKeys: [],
      error: error && error.message ? error.message : "status_error",
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = {
  getSystemStatus,
};
