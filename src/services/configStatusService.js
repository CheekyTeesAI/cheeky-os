/**
 * Structured config readiness — presence only, never secret values.
 */
function has(k) {
  return Boolean(String(process.env[k] || "").trim());
}

function missing(keys) {
  return keys.filter((k) => !has(k));
}

function getConfigStatus() {
  const appKeys = ["NODE_ENV"];
  const squareKeys = ["SQUARE_ACCESS_TOKEN", "SQUARE_ENVIRONMENT"];
  const emailKeys = ["RESEND_API_KEY", "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"];
  const smsKeys = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"];
  const storageKeys = []; // uploads validated elsewhere; optional cloud keys
  const vendorKeys = [
    "BULLSEYE_EMAIL",
    "CAROLINA_MADE_EMAIL",
    "SS_EMAIL",
    "SANMAR_EMAIL",
    "ALPHA_BRODER_EMAIL",
  ];

  const appMissing = missing(appKeys);
  const squareMissing = missing(squareKeys);
  const emailMissing = missing(emailKeys);
  const smsMissing = missing(smsKeys);
  const storageMissing = missing(storageKeys);
  const vendorsMissing = missing(vendorKeys);

  return {
    app: {
      configured: appMissing.length === 0,
      missing: appMissing,
    },
    square: {
      configured: squareMissing.length === 0,
      missing: squareMissing,
    },
    email: {
      configured: emailMissing.length === 0,
      missing: emailKeys.filter((k) => !has(k)),
    },
    sms: {
      configured: smsMissing.length === 0,
      missing: smsMissing,
    },
    storage: {
      configured: storageMissing.length === 0,
      missing: storageMissing,
    },
    vendors: {
      configured: vendorsMissing.length === 0,
      missing: vendorsMissing,
    },
  };
}

module.exports = {
  getConfigStatus,
};
