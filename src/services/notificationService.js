"use strict";

const { getPrisma } = require("./decisionEngine");

async function createNotification(data) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  return prisma.notification.create({
    data: {
      type: String((data && data.type) || "GENERAL"),
      entityId: (data && data.entityId) || null,
      customerName: (data && data.customerName) || "",
      messageText: (data && data.messageText) || "",
      status: "READY",
    },
  });
}

async function getNotifications() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  return prisma.notification.findMany({
    where: { status: "READY" },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

async function markSent(id) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  return prisma.notification.update({
    where: { id: String(id || "") },
    data: { status: "SENT" },
  });
}

async function snooze(id) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  return prisma.notification.update({
    where: { id: String(id || "") },
    data: { status: "SNOOZED" },
  });
}

module.exports = {
  createNotification,
  getNotifications,
  markSent,
  snooze,
};
