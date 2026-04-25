"use strict";

const path = require("path");

function getPrismaClient() {
  try {
    const prisma = require("../prisma");
    if (prisma) return prisma;
  } catch (_) {}

  const candidates = [
    path.join(__dirname, "..", "..", "..", "..", "src", "services", "decisionEngine"),
    path.join(__dirname, "..", "..", "..", "src", "services", "decisionEngine"),
    path.join(__dirname, "..", "..", "..", "services", "decisionEngine"),
  ];

  for (const candidate of candidates) {
    try {
      const decisionEngine = require(candidate);
      if (decisionEngine && typeof decisionEngine.getPrisma === "function") {
        const prisma = decisionEngine.getPrisma();
        if (prisma) return prisma;
      }
    } catch (_) {}
  }

  return null;
}

module.exports = async function assignTaskAction(taskId, user) {
  try {
    if (!taskId) {
      return { success: false, message: "Missing taskId" };
    }

    const prisma = getPrismaClient();
    if (!prisma) {
      return { success: false, message: "Prisma unavailable" };
    }

    let existing = null;
    try {
      existing = await prisma.task.findUnique({ where: { id: taskId } });
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }

    if (!existing) {
      return { success: false, message: "Task not found" };
    }

    let updated = null;
    try {
      updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          assignedTo: user || "Jeremy",
        },
      });
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }

    return {
      success: true,
      message: `Task assigned to ${user || "Jeremy"}`,
      task: updated,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
