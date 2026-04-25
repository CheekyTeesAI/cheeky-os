"use strict";

const { getPrisma } = require("./decisionEngine");

async function logAction(action, entity, entityId, details) {
  const prisma = getPrisma();
  if (!prisma) return;

  try {
    const detailsText =
      typeof details === "string" ? details : JSON.stringify(details || {});

    await prisma.auditLog.create({
      data: {
        stage: String(action || "UNKNOWN"),
        input: String(entity || "UNKNOWN"),
        output: String(entityId || ""),
        status: "OK",
        action: String(action || "UNKNOWN"),
        entity: String(entity || "UNKNOWN"),
        entityId: entityId ? String(entityId) : null,
        details: detailsText,
      },
    });
  } catch (e) {
    console.log("[AUDIT ERROR]", e && e.message ? e.message : e);
  }
}

module.exports = { logAction };
