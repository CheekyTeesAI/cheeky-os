/**
 * Operational / deployment events — uses foundation event log when available.
 */
async function logOpsEvent(kind, detail) {
  const msg = `${String(kind || "OPS").toUpperCase()}: ${String(detail || "").slice(0, 1500)}`;
  try {
    const { logEvent } = require("./foundationEventLog");
    await logEvent(null, "OPS_DEPLOY", msg);
  } catch (_e) {
    console.log("[opsEvent]", msg);
  }
}

module.exports = { logOpsEvent };
