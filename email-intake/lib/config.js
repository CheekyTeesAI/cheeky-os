"use strict";

const path = require("path");
try {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env"),
  });
} catch {
  /* optional */
}

const config = {
  port: Number(process.env.PORT || 3000) || 3000,

  squareAccessToken: (process.env.SQUARE_ACCESS_TOKEN || "").trim(),
  squareLocationId: (process.env.SQUARE_LOCATION_ID || "").trim(),

  resendApiKey: (process.env.RESEND_API_KEY || "").trim(),
  defaultFromEmail: (process.env.DEFAULT_FROM_EMAIL || "").trim(),

  outlookWebhook: (process.env.POWER_AUTOMATE_OUTLOOK_WEBHOOK || "").trim(),
  dataverseWebhook: String(
    process.env.POWER_AUTOMATE_DATAVERSE_WEBHOOK ?? ""
  ).trim(),

  hasSquare() {
    return !!this.squareAccessToken && !!this.squareLocationId;
  },

  hasResend() {
    return !!this.resendApiKey;
  },

  get hasDataverseWebhook() {
    return Boolean(this.dataverseWebhook);
  },

  get hasOutlookWebhook() {
    return !!process.env.POWER_AUTOMATE_OUTLOOK_WEBHOOK;
  },
};

if (!config.hasSquare()) {
  console.warn("⚠️ Square not configured — running in stub mode");
}
if (!config.hasResend()) {
  console.warn("❌ Missing RESEND_API_KEY");
}
if (!config.defaultFromEmail) {
  console.warn("❌ Missing DEFAULT_FROM_EMAIL");
}

console.log("CONFIG STATUS:", {
  square: config.hasSquare(),
  resend: config.hasResend(),
  from: config.defaultFromEmail || "(empty)",
  env: process.env.SQUARE_ENVIRONMENT,
});

module.exports = config;
