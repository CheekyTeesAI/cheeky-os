/**
 * Default communication policy per template — PREVIEW vs AUTO_SAFE vs APPROVAL.
 * Env COMM_AUTO_SAFE=true enables limited auto-send for safe templates (opt-in).
 */
function getCommunicationPolicy(templateKey) {
  const tk = String(templateKey || "FOLLOWUP_GENERAL").toUpperCase();
  const autoSafeEnv = String(process.env.COMM_AUTO_SAFE || "").toLowerCase() === "true";

  const policies = {
    JOB_STATUS_UPDATE: {
      defaultMode: autoSafeEnv ? "AUTO_SAFE" : "PREVIEW",
      channelPreference: "EMAIL",
    },
    MISSING_INFO: {
      defaultMode: autoSafeEnv ? "AUTO_SAFE" : "PREVIEW",
      channelPreference: "EMAIL",
    },
    ART_NEEDED: {
      defaultMode: "PREVIEW",
      channelPreference: "EMAIL",
    },
    READY_FOR_PICKUP: {
      defaultMode: String(process.env.COMM_READY_PICKUP_MODE || "APPROVAL_REQUIRED").toUpperCase(),
      channelPreference: "EMAIL",
    },
    INVOICE_REMINDER: {
      defaultMode: "APPROVAL_REQUIRED",
      channelPreference: "EMAIL",
    },
    DEPOSIT_REQUIRED: {
      defaultMode: "APPROVAL_REQUIRED",
      channelPreference: "EMAIL",
    },
    PAYMENT_CONFIRMATION: {
      defaultMode: "PREVIEW",
      channelPreference: "EMAIL",
    },
    FOLLOWUP_GENERAL: {
      defaultMode: "PREVIEW",
      channelPreference: "EMAIL",
    },
    QUOTE_READY: {
      defaultMode: "APPROVAL_REQUIRED",
      channelPreference: "EMAIL",
    },
  };

  return (
    policies[tk] || {
      defaultMode: "PREVIEW",
      channelPreference: "EMAIL",
    }
  );
}

module.exports = { getCommunicationPolicy };
