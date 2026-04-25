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

// [CHEEKY-GATE] CHEEKY_getProductionBoard — extracted from GET /api/production/board.
async function CHEEKY_getProductionBoard() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const orders = await prisma.order.findMany({ include: { artFiles: true }, orderBy: [{ updatedAt: "desc" }], take: 500 });
  return { success: true, data: orders };
}

// [CHEEKY-GATE] CHEEKY_listProductionJobsWithGarments — extracted from GET /api/production/jobs (board view).
async function CHEEKY_listProductionJobsWithGarments() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const jobs = await prisma.productionJob.findMany({ where: { assignedTo: "Jeremy" }, include: { garmentOrders: true }, orderBy: { createdAt: "asc" }, take: 500 });
  return { success: true, data: jobs };
}

// [CHEEKY-GATE] CHEEKY_advanceProductionJobFull — extracted from POST /api/production/jobs/:id/advance (board).
// Includes handleJobCompletion side effect and order.update on COMPLETE.
async function CHEEKY_advanceProductionJobFull(jobId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const job = await prisma.productionJob.findUnique({ where: { id: String(jobId || "") } });
  if (!job) return { success: false, error: "Job not found", code: "JOB_NOT_FOUND" };
  const cur = String(job.status || "READY").toUpperCase();
  let nextStatus = "READY";
  if (cur === "READY") nextStatus = "PRINTING";
  else if (cur === "PRINTING") nextStatus = "QC";
  else if (cur === "QC") nextStatus = "COMPLETE";
  else if (cur === "COMPLETE") nextStatus = "COMPLETE";
  const updated = await prisma.productionJob.update({ where: { id: job.id }, data: { status: nextStatus } });
  if (nextStatus === "COMPLETE" && job.orderId) {
    await prisma.order.update({ where: { id: job.orderId }, data: { productionComplete: true } });
    try { const { handleJobCompletion } = require("./completionService"); await handleJobCompletion(job.id); } catch (_) {}
  }
  return { success: true, data: updated };
}

// [CHEEKY-GATE] CHEEKY_listProductionJobsWithOrder — extracted from GET /api/production/jobs (jobs route).
async function CHEEKY_listProductionJobsWithOrder() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const jobs = await prisma.productionJob.findMany({ orderBy: [{ createdAt: "desc" }], include: { order: { select: { id: true, orderNumber: true, customerName: true } } }, take: 500 });
  return { success: true, data: jobs };
}

// [CHEEKY-GATE] CHEEKY_advanceProductionJobStatus — extracted from POST /api/production/jobs/:id/advance (jobs route).
async function CHEEKY_advanceProductionJobStatus(id) {
  const NEXT = { READY: "PRINTING", PRINTING: "QC", QC: "COMPLETE" };
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  if (!id) return { success: false, error: "JOB_ID_REQUIRED", code: "VALIDATION_ERROR" };
  const job = await prisma.productionJob.findUnique({ where: { id: String(id) } });
  if (!job) return { success: false, error: "NOT_FOUND", code: "NOT_FOUND" };
  const next = NEXT[String(job.status || "").toUpperCase()];
  if (!next) return { success: true, data: job };
  const updated = await prisma.productionJob.update({ where: { id: job.id }, data: { status: next } });
  return { success: true, data: updated };
}

// [CHEEKY-GATE] CHEEKY_listOutsourceJobs — extracted from GET /api/outsource/board.
async function CHEEKY_listOutsourceJobs() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const jobs = await prisma.productionJob.findMany({ where: { type: "OUTSOURCE" }, orderBy: { createdAt: "desc" }, take: 500 });
  return { success: true, data: jobs };
}

// Shared helper for outsource operations — findUnique + update + recompute stage.
async function _outsourceUpdate(jobId, firstData, prisma) {
  const { computeOutsourceStage } = require("./outsourceStateService");
  const job = await prisma.productionJob.findUnique({ where: { id: String(jobId || "") } });
  if (!job) return null;
  const updated = await prisma.productionJob.update({ where: { id: job.id }, data: firstData });
  const stage = computeOutsourceStage(updated);
  return prisma.productionJob.update({ where: { id: job.id }, data: { outsourceStage: stage } });
}

// [CHEEKY-GATE] CHEEKY_attachOutsourceArt — extracted from POST /api/outsource/:jobId/art/attach.
async function CHEEKY_attachOutsourceArt(jobId, artFileUrl, artFileName) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const result = await _outsourceUpdate(jobId, { artFileUrl: artFileUrl || null, artFileName: artFileName || null, artReady: !!artFileUrl }, prisma);
  if (!result) return { success: false, error: "Production job not found", code: "JOB_NOT_FOUND" };
  return { success: true, data: result };
}

// [CHEEKY-GATE] CHEEKY_markOutsourceArtSent — extracted from POST /api/outsource/:jobId/art/sent.
async function CHEEKY_markOutsourceArtSent(jobId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const result = await _outsourceUpdate(jobId, { artSentAt: new Date() }, prisma);
  if (!result) return { success: false, error: "Production job not found", code: "JOB_NOT_FOUND" };
  return { success: true, data: result };
}

// [CHEEKY-GATE] CHEEKY_markOutsourceShipped — extracted from POST /api/outsource/:jobId/ship.
async function CHEEKY_markOutsourceShipped(jobId, shippingMethod, trackingNumber) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const result = await _outsourceUpdate(jobId, { garmentsReady: true, garmentsShippedAt: new Date(), shippingMethod: shippingMethod || null, trackingNumber: trackingNumber || null }, prisma);
  if (!result) return { success: false, error: "Production job not found", code: "JOB_NOT_FOUND" };
  return { success: true, data: result };
}

// [CHEEKY-GATE] CHEEKY_markOutsourceDelivered — extracted from POST /api/outsource/:jobId/delivered.
async function CHEEKY_markOutsourceDelivered(jobId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const { computeOutsourceStage } = require("./outsourceStateService");
  const job = await prisma.productionJob.findUnique({ where: { id: String(jobId || "") } });
  if (!job) return { success: false, error: "Production job not found", code: "JOB_NOT_FOUND" };
  const updated = await prisma.productionJob.update({ where: { id: job.id }, data: { garmentsDeliveredAt: new Date() } });
  const stage = computeOutsourceStage(updated);
  const finalJob = await prisma.productionJob.update({ where: { id: job.id }, data: { outsourceStage: stage, status: "PRINTING" } });
  return { success: true, data: finalJob };
}

// [CHEEKY-GATE] CHEEKY_getWorkOrderData — extracted from GET /api/workorders/:jobId.
async function CHEEKY_getWorkOrderData(jobId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const job = await prisma.productionJob.findUnique({ where: { id: String(jobId || "") } });
  if (!job) return { success: false, error: "Production job not found", code: "JOB_NOT_FOUND" };
  const order = await prisma.order.findUnique({ where: { id: job.orderId }, include: { lineItems: true } });
  if (!order) return { success: false, error: "Order not found", code: "ORDER_NOT_FOUND" };
  return { success: true, job, order };
}

// [CHEEKY-GATE] CHEEKY_saveWorkOrderPacket — extracted from POST /api/workorders/:jobId/create.
async function CHEEKY_saveWorkOrderPacket(jobId, packet) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const updated = await prisma.productionJob.update({ where: { id: String(jobId || "") }, data: { packetJson: packet, packetStatus: "CREATED" } });
  return { success: true, data: updated };
}

// [CHEEKY-GATE] CHEEKY_listAllProductionJobs — extracted from GET /api/workorders.
async function CHEEKY_listAllProductionJobs() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const jobs = await prisma.productionJob.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return { success: true, data: jobs };
}

module.exports = {
  createProductionJob,
  CHEEKY_bulkAdvanceOrders,
  CHEEKY_getProductionBoard,
  CHEEKY_listProductionJobsWithGarments,
  CHEEKY_advanceProductionJobFull,
  CHEEKY_listProductionJobsWithOrder,
  CHEEKY_advanceProductionJobStatus,
  CHEEKY_listOutsourceJobs,
  CHEEKY_attachOutsourceArt,
  CHEEKY_markOutsourceArtSent,
  CHEEKY_markOutsourceShipped,
  CHEEKY_markOutsourceDelivered,
  CHEEKY_getWorkOrderData,
  CHEEKY_saveWorkOrderPacket,
  CHEEKY_listAllProductionJobs,
};
