"use strict";

/**
 * When an order enters PRODUCTION_READY, ensure the minimal internal task set (Prisma Task).
 */

const path = require("path");

const MINIMAL_TYPES = [
  { type: "ART_REVIEW", title: "Art review" },
  { type: "GARMENT_ORDER", title: "Garment order" },
  { type: "PRINT_PREP", title: "Print prep" },
];

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function getInitialJobStatus() {
  try {
    const pq = require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "lib",
      "productionQueue"
    ));
    if (pq && typeof pq.persistedQueueStatusForNormalized === "function") {
      return pq.persistedQueueStatusForNormalized(pq.INITIAL_PRODUCTION_QUEUE_STATE);
    }
  } catch (_) {}
  return "PRODUCTION_READY";
}

async function ensureJobForOrder(prisma, orderId, order) {
  let job = await prisma.job.findUnique({ where: { orderId } });
  if (job) return job;
  const productionType = order.printMethod || "DTG";
  const initialQueue = getInitialJobStatus();
  job = await prisma.job.create({
    data: {
      orderId,
      status: initialQueue,
      productionType,
      notes: order.notes || null,
    },
  });
  await prisma.order.update({
    where: { id: orderId },
    data: {
      jobCreated: true,
      jobCreatedAt: new Date(),
      productionStatus: initialQueue,
    },
  });
  return job;
}

/**
 * @param {string} orderId
 * @returns {Promise<{ created: number, skipped: boolean, error?: string }>}
 */
async function ensureMinimalProductionTasks(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { created: 0, skipped: true, error: "prisma_unavailable" };
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
  });
  if (!order) return { created: 0, skipped: true, error: "order_not_found" };

  const job = await ensureJobForOrder(prisma, orderId, order);
  const existing = await prisma.task.findMany({
    where: { jobId: job.id },
    select: { type: true },
  });
  const have = new Set(existing.map((t) => String(t.type)));
  let created = 0;
  const orderLabel = order.orderNumber || orderId.slice(0, 8);
  for (const def of MINIMAL_TYPES) {
    if (have.has(def.type)) continue;
    await prisma.task.create({
      data: {
        jobId: job.id,
        orderId,
        title:
          def.type === "GARMENT_ORDER"
            ? `Order garments for Order #${orderLabel}`
            : def.title,
        type: def.type,
        status: "PENDING",
      },
    });
    created++;
  }
  console.log(
    `[production-ready-tasks] order=${orderId} job=${job.id} tasksCreated=${created}`
  );
  return { created, skipped: false };
}

module.exports = { ensureMinimalProductionTasks, MINIMAL_TYPES };
