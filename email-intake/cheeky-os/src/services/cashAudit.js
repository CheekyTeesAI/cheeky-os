"use strict";

const prisma = require("../prisma");
const actionAudit = require("../operator/actionAudit");

async function logCashEvent(type, payload) {
  const row = {
    source: "cash_engine",
    type: type || "UNKNOWN",
    payload: payload || {},
    timestamp: new Date().toISOString(),
  };
  try {
    actionAudit({
      type: "CASH_ENGINE",
      eventType: row.type,
      payload: row.payload,
    });
  } catch (_) {}

  try {
    if (prisma && prisma.auditLog && typeof prisma.auditLog.create === "function") {
      await prisma.auditLog.create({
        data: {
          stage: "cash_engine",
          input: JSON.stringify({ type: row.type }),
          output: JSON.stringify(row.payload || {}),
          status: "ok",
          action: row.type,
          entity: "cash",
          details: null,
        },
      });
    }
  } catch (_) {}
}

module.exports = {
  logCashEvent,
};
