"use strict";

const prisma = require("../../../../src/lib/prisma");

async function getSystemStatus() {
  try {
    if (!prisma) {
      return { error: true, message: "Prisma client is unavailable." };
    }

    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch (_) {
      dbConnected = false;
    }

    const openOrders = prisma.order
      ? await prisma.order.count({
          where: {
            status: { notIn: ["COMPLETE", "COMPLETED", "DELIVERED", "CLOSED"] },
          },
        })
      : 0;

    const pendingTasks = prisma.task
      ? await prisma.task.count({
          where: {
            status: { in: ["PENDING", "pending", "BLOCKED", "IN_PROGRESS", "in_progress"] },
          },
        })
      : 0;

    return {
      error: false,
      data: {
        uptimeSeconds: Math.floor(process.uptime()),
        currentTime: new Date().toISOString(),
        dbConnected,
        openOrders,
        pendingTasks,
      },
    };
  } catch (err) {
    return { error: true, message: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  getSystemStatus,
};
