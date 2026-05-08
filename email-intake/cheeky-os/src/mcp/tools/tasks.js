"use strict";

const prisma = require("../../../../src/lib/prisma");

function parseLimit(limit, fallback) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

async function getTasks(input) {
  try {
    if (!prisma || !prisma.task) {
      return { error: true, message: "Prisma Task model is unavailable." };
    }

    const limit = parseLimit(input && input.limit, 10);
    const status = input && typeof input.status === "string" ? input.status.trim() : "";
    const orderId = input && typeof input.orderId === "string" ? input.orderId.trim() : "";
    const where = {};

    if (status) where.status = status;
    if (orderId) where.orderId = orderId;

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { error: false, data: tasks };
  } catch (err) {
    return { error: true, message: err && err.message ? err.message : String(err) };
  }
}

async function updateTaskStatus(input) {
  try {
    if (!prisma || !prisma.task) {
      return { error: true, message: "Prisma Task model is unavailable." };
    }

    const taskId = input && typeof input.taskId === "string" ? input.taskId.trim() : "";
    const status = input && typeof input.status === "string" ? input.status.trim() : "";

    if (!taskId) {
      return { error: true, message: 'Missing required field "taskId".' };
    }
    if (!status) {
      return { error: true, message: 'Missing required field "status".' };
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { status },
    });

    return { error: false, data: updatedTask };
  } catch (err) {
    return { error: true, message: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  getTasks,
  updateTaskStatus,
};
