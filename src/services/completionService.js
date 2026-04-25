"use strict";

const { getPrisma } = require("./decisionEngine");
const { createNotification } = require("./notificationService");
const { logAction } = require("./auditService");
const { updateMemory } = require("./memoryService");

function pickupFingerprint(orderId) {
  return `pickup-ready:${orderId}`;
}

async function handleJobCompletion(jobId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const job = await prisma.productionJob.findUnique({
    where: { id: String(jobId || "") },
    include: { order: true },
  });

  if (!job) throw new Error("JOB_NOT_FOUND");
  if (!job.order) throw new Error("ORDER_NOT_FOUND");

  const order = job.order;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      qcComplete: true,
      readyForPickup: true,
      completedAt: new Date(),
      status: "READY_FOR_PICKUP",
      nextAction: "Notify customer",
      nextOwner: "Cheeky",
      blockedReason: null,
    },
  });

  const fingerprint = pickupFingerprint(order.id);
  const existing = await prisma.revenueFollowup.findUnique({
    where: { fingerprint },
  });

  if (!existing) {
    await prisma.revenueFollowup.create({
      data: {
        orderId: order.id,
        kind: "PICKUP_READY",
        status: "DRAFT",
        subject: "Your order is ready!",
        draftText: `Hey ${order.customerName || ""}, your order is ready for pickup!`,
        draftHtml: `<p>Hey ${order.customerName || ""},</p><p>Your order is ready for pickup!</p>`,
        fingerprint,
      },
    });

    try {
      await createNotification({
        type: "PICKUP_READY",
        entityId: order.id,
        customerName: order.customerName,
        messageText: `Hey ${order.customerName || "there"}, your order is ready for pickup!`,
      });
    } catch (_e) {
      /* keep completion path non-blocking */
    }
  }

  await logAction("ORDER_COMPLETE", "Order", order.id, {});
  await updateMemory(order.id);

  console.log("[COMPLETION] Order ready for pickup:", order.id);
}

module.exports = { handleJobCompletion };
