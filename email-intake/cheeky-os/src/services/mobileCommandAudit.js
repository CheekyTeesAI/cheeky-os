"use strict";

const prisma = require("../prisma");
const actionAudit = require("../operator/actionAudit");

async function logMobileCommand(entry) {
  const row = {
    source: "mobile_operator",
    channel: String(entry.channel || "mobile_text"),
    rawInput: String(entry.rawInput || ""),
    parsedIntent: String(entry.parsedIntent || "unknown"),
    confidence: Number(entry.confidence || 0),
    outcome: String(entry.outcome || "blocked"),
    payloadSummary: entry.payloadSummary || {},
    blockedReason: entry.blockedReason || null,
    timestamp: new Date().toISOString(),
  };

  try {
    actionAudit({
      type: "MOBILE_COMMAND",
      channel: row.channel,
      rawInput: row.rawInput,
      parsedIntent: row.parsedIntent,
      confidence: row.confidence,
      outcome: row.outcome,
      blockedReason: row.blockedReason,
      payloadSummary: row.payloadSummary,
    });
  } catch (_) {}

  try {
    if (prisma && prisma.auditLog && typeof prisma.auditLog.create === "function") {
      const saved = await prisma.auditLog.create({
        data: {
          stage: "mobile_operator",
          input: JSON.stringify({ rawInput: row.rawInput, parsedIntent: row.parsedIntent }),
          output: JSON.stringify({ outcome: row.outcome, blockedReason: row.blockedReason }),
          status: row.outcome,
          action: row.parsedIntent,
          entity: "mobile_operator",
          details: JSON.stringify(row.payloadSummary || {}),
        },
        select: { id: true },
      });
      return { success: true, auditId: saved.id, mode: "persistent" };
    }
  } catch (_) {}

  return { success: true, auditId: null, mode: "log_fallback" };
}

module.exports = {
  logMobileCommand,
};
