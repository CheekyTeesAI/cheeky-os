"use strict";

const prisma = require("../prisma");
const actionAudit = require("../operator/actionAudit");

async function logChatGPTAudit(entry) {
  const row = {
    source: "chatgpt",
    route: entry && entry.route ? entry.route : null,
    action: entry && entry.action ? entry.action : null,
    payloadSummary: entry && entry.payloadSummary ? entry.payloadSummary : null,
    outcome: entry && entry.outcome ? entry.outcome : "unknown",
    blockedReason: entry && entry.blockedReason ? entry.blockedReason : null,
    timestamp: new Date().toISOString(),
  };

  try {
    actionAudit({
      type: "CHATGPT_ACTION",
      route: row.route,
      action: row.action,
      outcome: row.outcome,
      blockedReason: row.blockedReason,
      payloadSummary: row.payloadSummary,
    });
  } catch (_) {}

  try {
    if (prisma && prisma.auditLog && typeof prisma.auditLog.create === "function") {
      const saved = await prisma.auditLog.create({
        data: {
          stage: "chatgpt",
          input: JSON.stringify({ route: row.route, action: row.action, payload: row.payloadSummary || {} }),
          output: JSON.stringify({ outcome: row.outcome, blockedReason: row.blockedReason }),
          status: row.outcome,
          action: row.action || "chatgpt",
          entity: "chatgpt",
          entityId: null,
          details: row.blockedReason || null,
        },
        select: { id: true },
      });
      return { success: true, auditId: saved.id, mode: "persistent" };
    }
  } catch (_) {}

  return { success: true, auditId: null, mode: "log_fallback" };
}

module.exports = {
  logChatGPTAudit,
};
