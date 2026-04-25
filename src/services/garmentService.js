"use strict";

const { getPrisma, runDecisionEngineInTransaction } = require("./decisionEngine");

async function createGarmentOrder(productionJobId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const job = await prisma.productionJob.findUnique({
    where: { id: String(productionJobId || "") },
    include: { order: true },
  });

  if (!job) throw new Error("JOB_NOT_FOUND");
  if (!job.order || !job.order.depositPaid) throw new Error("DEPOSIT_REQUIRED");

  const existing = await prisma.garmentOrder.findFirst({
    where: { productionJobId: job.id },
  });
  if (existing) return existing;

  const order = await prisma.garmentOrder.create({
    data: {
      productionJobId: job.id,
      orderId: job.orderId,
      vendorName: job.vendorName || "Carolina Made",
      vendor: job.vendorName || "Carolina Made",
      status: "ORDERED",
      notes: "Manual order placed",
      packet: null,
    },
  });

  await prisma.order.update({
    where: { id: job.orderId },
    data: { garmentsOrdered: true },
  });

  return order;
}

async function markGarmentsReceived(id) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const updated = await prisma.garmentOrder.update({
    where: { id: String(id || "") },
    data: { status: "RECEIVED" },
  });

  if (updated.orderId) {
    await prisma.order.update({
      where: { id: updated.orderId },
      data: { garmentsReceived: true },
    });
  }

  if (updated.productionJobId) {
    await prisma.productionJob.update({
      where: { id: updated.productionJobId },
      data: { garmentsReady: true },
    });
  }

  return updated;
}

// [CHEEKY-GATE] CHEEKY_markGarmentsOrdered — extracted from POST /garments/order.
// Pure relocation: order.update garmentsOrdered + runDecisionEngineInTransaction.
async function CHEEKY_markGarmentsOrdered(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const now = new Date();
  const data = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { garmentsOrdered: true, garmentOrderPlacedAt: now },
    });
    return runDecisionEngineInTransaction(tx, orderId);
  });
  return { success: true, data: { order: data } };
}

// [CHEEKY-GATE] CHEEKY_markGarmentsReceivedOnOrder — extracted from POST /garments/received.
// Pure relocation: order.update garmentsReceived + runDecisionEngineInTransaction.
async function CHEEKY_markGarmentsReceivedOnOrder(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const now = new Date();
  const data = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { garmentsReceived: true, garmentOrderReceivedAt: now },
    });
    return runDecisionEngineInTransaction(tx, orderId);
  });
  return { success: true, data: { order: data } };
}

// [CHEEKY-GATE] CHEEKY_completeProduction — extracted from POST /production/complete.
// Pure relocation: order.findUnique (guardrail) + order.update productionComplete + decision.
async function CHEEKY_completeProduction(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const pre = await prisma.order.findUnique({ where: { id: orderId }, include: { artFiles: true } });
  if (!pre) return { success: false, error: "Order not found", code: "NOT_FOUND" };
  let canStartProduction;
  try { canStartProduction = require("./guardrails").canStartProduction; } catch (_) { canStartProduction = null; }
  if (typeof canStartProduction === "function") {
    const gate = canStartProduction(pre);
    if (!gate.allowed) return { success: false, error: gate.message, code: gate.code || "GUARDRAIL" };
  }
  const data = await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { productionComplete: true, productionCompletedAt: new Date() },
    });
    return runDecisionEngineInTransaction(tx, orderId);
  });
  return { success: true, data: { order: data } };
}

// [CHEEKY-GATE] CHEEKY_completeQC — extracted from POST /qc/complete.
// Pure relocation: order.update qcComplete + runDecisionEngineInTransaction.
async function CHEEKY_completeQC(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const data = await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { qcComplete: true } });
    return runDecisionEngineInTransaction(tx, orderId);
  });
  return { success: true, data: { order: data } };
}

// [CHEEKY-GATE] CHEEKY_listGarmentsToOrder — extracted from GET /api/garments/to-order.
// Pure relocation: order.findMany depositPaid + !garmentsOrdered.
async function CHEEKY_listGarmentsToOrder() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const orders = await prisma.order.findMany({ where: { depositPaid: true, garmentsOrdered: false }, include: { lineItems: true, artFiles: true }, take: 300, orderBy: [{ updatedAt: "asc" }] });
  return { success: true, data: orders };
}

// [CHEEKY-GATE] CHEEKY_placeGarmentOrder — extracted from POST /api/garments/order/:orderId.
// Pure relocation: $transaction garmentOrder.create + order.update with decision engine.
async function CHEEKY_placeGarmentOrder(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const { evaluateOrderState, mapDecisionToPrismaStatus } = require("./decisionEngine");
  const { determineVendorRoute } = require("./vendorRoutingService");
  const { buildGarmentPacket } = require("./garmentPacketService");
  const id = String(orderId || "").trim();
  if (!id) return { success: false, error: "orderId required", code: "VALIDATION_ERROR" };
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id }, include: { lineItems: true, artFiles: true, customer: true, tasks: true } });
    if (!order || !order.depositPaid) return { ok: false, error: "Deposit required", code: "DEPOSIT_REQUIRED" };
    const route = determineVendorRoute(order);
    const packet = buildGarmentPacket(order);
    await tx.garmentOrder.create({ data: { orderId: order.id, vendor: route.vendorName, packet: JSON.stringify(packet) } });
    const decision = evaluateOrderState({ ...order, garmentsOrdered: true });
    const updated = await tx.order.update({ where: { id: order.id }, data: { garmentsOrdered: true, garmentOrderPlacedAt: order.garmentOrderPlacedAt || new Date(), status: mapDecisionToPrismaStatus(decision.status), nextAction: decision.nextAction, nextOwner: decision.nextOwner, blockedReason: decision.blockedReason } });
    return { ok: true, data: { order: updated, route, packet } };
  });
  if (!result.ok) return { success: false, error: result.error, code: result.code || "CONFLICT" };
  return { success: true, data: result.data };
}

module.exports = {
  createGarmentOrder,
  markGarmentsReceived,
  CHEEKY_markGarmentsOrdered,
  CHEEKY_markGarmentsReceivedOnOrder,
  CHEEKY_completeProduction,
  CHEEKY_completeQC,
  CHEEKY_listGarmentsToOrder,
  CHEEKY_placeGarmentOrder,
};
