/**
 * GET /api/ai/context — aggregated business snapshot for AI (read-only).
 * Reuses orderStatusEngine + dist services (same as existing API routes).
 */

const express = require("express");
const path = require("path");

const { getProductionQueue } = require("../services/orderStatusEngine");

const router = express.Router();

const DIST_SERVICES = path.join(__dirname, "..", "..", "dist", "services");
const DIST_DB = path.join(__dirname, "..", "..", "dist", "db", "client.js");

function loadDistService(fileName) {
  try {
    return require(path.join(DIST_SERVICES, fileName));
  } catch {
    return null;
  }
}

async function safe(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[ai/context] ${label}:`, err instanceof Error ? err.message : err);
    return fallback;
  }
}

function serializeDates(obj) {
  if (obj == null) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeDates);
  if (typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      out[k] = v instanceof Date ? v.toISOString() : serializeDates(v);
    }
    return out;
  }
  return obj;
}

router.get("/context", async (_req, res) => {
  const queue = await safe(
    "productionQueue",
    () => getProductionQueue(),
    { ready: [], printing: [], qc: [] }
  );

  const productionQueue = [
    ...(queue.ready || []).map((item) => ({ ...item, stage: "READY" })),
    ...(queue.printing || []).map((item) => ({ ...item, stage: "PRINTING" })),
    ...(queue.qc || []).map((item) => ({ ...item, stage: "QC" })),
  ];

  const depMod = loadDistService("depositFollowupService.js");
  const depositPayload =
    depMod && typeof depMod.buildDepositFollowupsPayload === "function"
      ? await safe(
          "depositFollowups",
          () => depMod.buildDepositFollowupsPayload(),
          { items: [], count: 0 }
        )
      : { items: [], count: 0 };
  const depositFollowups = depositPayload.items || [];

  const garMod = loadDistService("garmentOperatorService.js");
  const garmentPayload =
    garMod && typeof garMod.buildGarmentOrdersPayload === "function"
      ? await safe(
          "garmentOrders",
          () => garMod.buildGarmentOrdersPayload(),
          { items: [] }
        )
      : { items: [] };
  const garmentOrders = garmentPayload.items || [];

  const proofMod = loadDistService("proofRoutingService.js");
  const proofsRaw =
    proofMod && typeof proofMod.listOrdersProofQueue === "function"
      ? await safe("proofs", () => proofMod.listOrdersProofQueue(), [])
      : [];
  const proofs = serializeDates(proofsRaw);

  const commsMod = loadDistService("customerCommsService.js");
  const pickupRaw =
    commsMod && typeof commsMod.getOrdersReadyForPickup === "function"
      ? await safe("readyForPickup", () => commsMod.getOrdersReadyForPickup(), [])
      : [];
  const readyForPickup = pickupRaw.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    status: o.status,
    updatedAt:
      o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
  }));

  let recentOrders = [];
  await safe(
    "recentOrders",
    async () => {
      let db;
      try {
        db = require(DIST_DB).db;
      } catch {
        return;
      }
      const rows = await db.order.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          orderNumber: true,
          customerName: true,
          status: true,
          createdAt: true,
        },
      });
      recentOrders = rows.map((r) => ({
        id: r.id,
        orderNumber: r.orderNumber,
        customerName: r.customerName,
        status: r.status,
        createdAt:
          r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      }));
    },
    undefined
  );

  let totalOrders = 0;
  let blocked = 0;
  let missingArt = 0;

  await safe(
    "summaryCounts",
    async () => {
      let db;
      let OrderStatus;
      try {
        db = require(DIST_DB).db;
        OrderStatus = require("@prisma/client").OrderStatus;
      } catch {
        return;
      }
      totalOrders = await db.order.count({ where: { deletedAt: null } });
      blocked = await db.order.count({
        where: { deletedAt: null, status: OrderStatus.BLOCKED },
      });
      missingArt = await db.order.count({
        where: {
          deletedAt: null,
          status: {
            in: [
              OrderStatus.PRODUCTION_READY,
              OrderStatus.PRINTING,
              OrderStatus.PRODUCTION,
              OrderStatus.IN_PRODUCTION,
            ],
          },
          AND: [
            {
              OR: [
                { artFileStatus: null },
                { artFileStatus: { notIn: ["READY", "APPROVED"] } },
              ],
            },
          ],
        },
      });
    },
    undefined
  );

  const readyForProduction = (queue.ready || []).length;
  const readyForPickupCount = readyForPickup.length;

  const unapprovedProofs = proofsRaw.filter(
    (p) => String(p.proofStatus || "") === "SENT"
  ).length;

  const MS_48H = 48 * 60 * 60 * 1000;
  const stalePickups = pickupRaw.filter((o) => {
    if (!o.updatedAt) return false;
    const t =
      o.updatedAt instanceof Date
        ? o.updatedAt.getTime()
        : new Date(o.updatedAt).getTime();
    return Date.now() - t > MS_48H;
  }).length;

  const alerts = [];
  const depN = depositFollowups.length;
  if (depN > 0) {
    alerts.push(
      `${depN} order${depN === 1 ? "" : "s"} waiting on deposit`
    );
  }
  if (missingArt > 0) {
    alerts.push(
      `${missingArt} job${missingArt === 1 ? "" : "s"} blocked by art (not ready)`
    );
  }
  if (unapprovedProofs > 0) {
    alerts.push(
      `${unapprovedProofs} proof${unapprovedProofs === 1 ? "" : "s"} sent but not approved`
    );
  }
  if (stalePickups > 0) {
    alerts.push(
      `${stalePickups} order${stalePickups === 1 ? "" : "s"} ready for pickup over 48h (notify/dig)`
    );
  }
  if (blocked > 0) {
    alerts.push(`${blocked} order${blocked === 1 ? "" : "s"} in BLOCKED status`);
  }

  return res.json({
    success: true,
    summary: {
      totalOrders,
      readyForProduction,
      blocked,
      readyForPickup: readyForPickupCount,
    },
    productionQueue,
    depositFollowups,
    garmentOrders,
    proofs,
    readyForPickup,
    recentOrders,
    alerts,
  });
});

module.exports = router;
