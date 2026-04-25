"use strict";

const { getPrisma, normalizeForDecision, evaluateOrderState, mapDecisionToPrismaStatus } = require("./decisionEngine");

async function createProductionJob(orderId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const id = String(orderId || "").trim();
  if (!id) throw new Error("ORDER_ID_REQUIRED");

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (!order.depositPaid) throw new Error("DEPOSIT_REQUIRED");

  const existing = await prisma.productionJob.findFirst({
    where: { orderId: id },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const type = String(order.printMethod || "").trim() || "IN_HOUSE";
  const job = await prisma.productionJob.create({
    data: {
      orderId: id,
      type,
      status: "READY",
      assignedTo: "Jeremy",
    },
  });

  return job;
}

// [CHEEKY-GATE] CHEEKY_bulkAdvanceOrders — extracted from POST /api/production/bulk-advance.
// Pure relocation: $transaction findUnique + evaluateOrderState + update for each orderId.
async function CHEEKY_bulkAdvanceOrders(orderIds) {
  const ids = Array.isArray(orderIds)
    ? orderIds.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (ids.length === 0) {
    return { success: false, error: "orderIds required", code: "VALIDATION_ERROR", data: null };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE", data: null };
  }
  const results = [];
  for (const id of ids) {
    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { artFiles: true, lineItems: true, customer: true, tasks: true },
      });
      if (!order) return null;
      const normalized = normalizeForDecision(order);
      const next = evaluateOrderState(normalized);
      return tx.order.update({
        where: { id },
        data: {
          status: mapDecisionToPrismaStatus(next.status),
          nextAction: next.nextAction,
          nextOwner: next.nextOwner,
          blockedReason: next.blockedReason,
        },
        include: { artFiles: true, lineItems: true, customer: true, tasks: true },
      });
    });
    if (updated) results.push(updated);
  }
  return { success: true, data: results };
}

module.exports = { createProductionJob, CHEEKY_bulkAdvanceOrders };
