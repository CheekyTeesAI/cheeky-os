"use strict";

const path = require("path");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

/**
 * @returns {Promise<object>}
 */
async function buildOperatorActionQueue() {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      needsReview: [],
      readyToSend: [],
      productionReady: [],
      printingNow: [],
      available: false,
      error: "prisma_unavailable",
    };
  }

  const [depositPaidNeedReview, pendingApprovals, prodReady, printing, tasksPending] =
    await Promise.all([
      prisma.order.findMany({
        where: {
          deletedAt: null,
          status: "DEPOSIT_PAID",
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          id: true,
          customerName: true,
          status: true,
          amountPaid: true,
          squareInvoiceId: true,
          updatedAt: true,
        },
      }),
      prisma.communicationApproval.findMany({
        where: { status: { in: ["PENDING", "DRAFT"] } },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: {
          id: true,
          orderId: true,
          channel: true,
          subject: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          deletedAt: null,
          status: "PRODUCTION_READY",
        },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: {
          id: true,
          customerName: true,
          status: true,
          productionTypeFinal: true,
          updatedAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          deletedAt: null,
          status: "PRINTING",
        },
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: {
          id: true,
          customerName: true,
          status: true,
          productionTypeFinal: true,
          updatedAt: true,
        },
      }),
      prisma.task.findMany({
        where: { status: "PENDING" },
        orderBy: { updatedAt: "desc" },
        take: 40,
        select: {
          id: true,
          orderId: true,
          type: true,
          title: true,
          status: true,
        },
      }),
    ]);

  const needsReview = depositPaidNeedReview.map((o) => ({
    kind: "ORDER_REVIEW_FOR_PRODUCTION",
    ...pick(o, ["id", "customerName", "status", "amountPaid", "squareInvoiceId", "updatedAt"]),
  }));

  tasksPending.forEach((t) => {
    if (!t.orderId) return;
    if (needsReview.length >= 50) return;
    needsReview.push({
      kind: "TASK_PENDING",
      taskId: t.id,
      orderId: t.orderId,
      type: t.type,
      title: t.title,
      status: t.status,
    });
  });

  return {
    available: true,
    needsReview,
    readyToSend: pendingApprovals.map((p) => ({
      kind: "DRAFT_COMMUNICATION",
      ...pick(p, ["id", "orderId", "channel", "subject", "status", "createdAt"]),
    })),
    productionReady: prodReady.map((o) => ({
      kind: "ORDER",
      ...pick(o, [
        "id",
        "customerName",
        "status",
        "productionTypeFinal",
        "updatedAt",
      ]),
    })),
    printingNow: printing.map((o) => ({
      kind: "ORDER",
      ...pick(o, [
        "id",
        "customerName",
        "status",
        "productionTypeFinal",
        "updatedAt",
      ]),
    })),
  };
}

module.exports = { buildOperatorActionQueue };
