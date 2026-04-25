"use strict";

const prisma = require("../prisma");
const actionAudit = require("../operator/actionAudit");

async function logDecision(entry) {
  const row = {
    source: "decision_engine",
    decisionType: entry.decisionType || null,
    entityType: entry.entityType || null,
    entityId: entry.entityId || null,
    priority: entry.priority || null,
    confidence: typeof entry.confidence === "number" ? entry.confidence : null,
    recommendedAction: entry.recommendedAction || null,
    outcome: entry.outcome || "recommended",
    blockedReason: entry.blockedReason || null,
    executedAction: entry.executedAction || null,
    timestamp: new Date().toISOString(),
  };

  try {
    actionAudit({
      type: "DECISION_ENGINE",
      ...row,
    });
  } catch (_) {}

  try {
    if (prisma && prisma.auditLog && typeof prisma.auditLog.create === "function") {
      await prisma.auditLog.create({
        data: {
          stage: "decision_engine",
          input: JSON.stringify({
            decisionType: row.decisionType,
            entityType: row.entityType,
            entityId: row.entityId,
          }),
          output: JSON.stringify({
            outcome: row.outcome,
            blockedReason: row.blockedReason,
            executedAction: row.executedAction,
          }),
          status: row.outcome,
          action: row.recommendedAction || row.decisionType || "decision",
          entity: row.entityType || "unknown",
          entityId: row.entityId || null,
          details: row.blockedReason || null,
        },
      });
    }
  } catch (_) {}
}

module.exports = {
  logDecision,
};
