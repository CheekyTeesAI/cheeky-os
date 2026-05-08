"use strict";

/**
 * GET /api/production-board — additive operator view (v2 self-heal control).
 * Buckets: PRODUCTION_READY, PRINTING, QC, COMPLETED, STUCK
 */

const path = require("path");
const { computeStuckReasons } = require("../services/operatorStuckReasons");
const { getPlanBoardExtras } = require("../services/purchasingEngine.service");
const { getQcBoardExtras } = require("../services/qcEngine.service");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function summarizeLineItems(items) {
  try {
    if (!items || !items.length) return null;
    const parts = items.map((i) => {
      const q = i.quantity != null ? i.quantity : "?";
      const d = i.description || "item";
      const pt = i.productionType ? " " + i.productionType : "";
      return String(d).slice(0, 80) + " ×" + q + pt;
    });
    return parts.join("; ").slice(0, 400);
  } catch (_e) {
    return null;
  }
}

function skinnyOrder(o, stuckReasons, extras) {
  const ex = extras && typeof extras === "object" ? extras : {};
  const vo = Array.isArray(o.vendorOrders) ? o.vendorOrders : [];
  const voStatus =
    vo.length > 0
      ? vo
          .map((v) => String(v.status || "").trim())
          .filter(Boolean)
          .join(", ") || null
      : null;
  const ac = String(o.artApprovalStatus || "NOT_REQUESTED").toUpperCase();
  const needsCustomerApproval =
    typeof ex.needsCustomerApproval === "boolean"
      ? ex.needsCustomerApproval
      : ac === "REQUESTED" || ac === "CHANGES_REQUESTED";
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    status: o.status,
    depositPaidAt: o.depositPaidAt,
    depositReceived: o.depositReceived,
    depositStatus: o.depositStatus,
    blockedReason: o.blockedReason,
    garmentsOrdered: o.garmentsOrdered,
    garmentsReceived: o.garmentsReceived,
    updatedAt: o.updatedAt,
    nextAction: o.nextAction != null ? o.nextAction : null,
    nextOwner: o.nextOwner != null ? o.nextOwner : null,
    productionTypeFinal: o.productionTypeFinal != null ? o.productionTypeFinal : null,
    printMethod: o.printMethod != null ? o.printMethod : null,
    garmentType: o.garmentType != null ? o.garmentType : null,
    quantity: o.quantity != null ? o.quantity : null,
    quoteExpiresAt: o.quoteExpiresAt != null ? o.quoteExpiresAt : null,
    assignedTo: o.assignedProductionTo != null ? o.assignedProductionTo : null,
    operatorAssignedRole: o.operatorAssignedRole != null ? o.operatorAssignedRole : null,
    operatorProductionPriority:
      o.operatorProductionPriority != null ? o.operatorProductionPriority : null,
    operatorProductionNote: o.operatorProductionNote != null ? o.operatorProductionNote : null,
    garmentOrderStatus:
      o.garmentOrderStatus != null ? o.garmentOrderStatus : voStatus,
    lineItemsSummary: summarizeLineItems(o.lineItems),
    orderTitle:
      (o.orderNumber && String(o.orderNumber).trim()) ||
      (o.notes && String(o.notes).trim().slice(0, 80)) ||
      null,
    colorHint: null,
    stuckReasons,
    artApprovalStatus: o.artApprovalStatus != null ? o.artApprovalStatus : null,
    artApprovedAt: o.artApprovedAt != null ? o.artApprovedAt : null,
    commsDraftCount: ex.commsDraftCount != null ? ex.commsDraftCount : 0,
    needsCustomerApproval,
    ...(ex.purchasing && typeof ex.purchasing === "object" ? ex.purchasing : {}),
  };
}

/**
 * @returns {Promise<{ ok: boolean, error?: string, generatedAt?: string, PRODUCTION_READY?: unknown[], PRINTING?: unknown[], QC?: unknown[], COMPLETED?: unknown[], STUCK?: unknown[] }>}
 */
async function buildProductionBoardPayload() {
  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    return { ok: false, error: "prisma_unavailable" };
  }

  const takeActive = 200;
  const takeDone = 120;

  try {
    const activeOrders = await prisma.order.findMany({
        where: {
          deletedAt: null,
          status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
        },
        orderBy: { updatedAt: "asc" },
        take: takeActive,
        include: {
          artFiles: { select: { id: true, approvalStatus: true } },
          vendorOrders: { take: 8, select: { id: true, status: true } },
          lineItems: {
            take: 12,
            select: { description: true, quantity: true, productionType: true },
          },
        },
      });

      const completedOrders = await prisma.order.findMany({
        where: {
          deletedAt: null,
          OR: [
            { status: { in: ["READY", "COMPLETED"] } },
            { completedAt: { not: null } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: takeDone,
        include: {
          artFiles: { select: { id: true, approvalStatus: true } },
          vendorOrders: { take: 3, select: { id: true, status: true } },
          lineItems: {
            take: 12,
            select: { description: true, quantity: true, productionType: true },
          },
        },
      });

      /** @type {Record<string, unknown>[]} */
      const PRODUCTION_READY = [];
      /** @type {Record<string, unknown>[]} */
      const PRINTING = [];
      /** @type {Record<string, unknown>[]} */
      const QC = [];
      /** @type {Record<string, unknown>[]} */
      const COMPLETED = [];
      /** @type {Record<string, unknown>[]} */
      const STUCK = [];

      const mergedForCounts = activeOrders.concat(completedOrders);
      const idList = mergedForCounts.map((x) => x.id);
      /** @type {Record<string, number>} */
      const commsCountByOrder = {};
      if (idList.length) {
        const grouped = await prisma.communicationApproval.groupBy({
          by: ["orderId"],
          where: {
            orderId: { in: idList },
            status: { notIn: ["SENT", "CANCELED"] },
          },
          _count: { _all: true },
        });
        for (const g of grouped) {
          if (g.orderId) commsCountByOrder[g.orderId] = g._count._all;
        }
      }

      function boardExtras(orderRow) {
        const ac = String(orderRow.artApprovalStatus || "NOT_REQUESTED").toUpperCase();
        let purchasing = null;
        try {
          purchasing = getPlanBoardExtras(orderRow.id);
        } catch (_pe) {
          purchasing = null;
        }
        let qc = null;
        try {
          qc = getQcBoardExtras(orderRow.id, orderRow.status);
        } catch (_qe) {
          qc = null;
        }
        return {
          commsDraftCount: commsCountByOrder[orderRow.id] || 0,
          needsCustomerApproval: ac === "REQUESTED" || ac === "CHANGES_REQUESTED",
          purchasing,
          qc,
          ...(qc && typeof qc === "object" ? qc : {}),
        };
      }

      for (const o of activeOrders) {
        const st = String(o.status || "").toUpperCase();
        const stuckReasons = computeStuckReasons(o);
        const row = skinnyOrder(o, stuckReasons, boardExtras(o));

        if (st === "PRODUCTION_READY") PRODUCTION_READY.push(row);
        else if (st === "PRINTING") PRINTING.push(row);
        else if (st === "QC") QC.push(row);

        if (stuckReasons.length) STUCK.push({ ...row, stuckReasons });
      }

      for (const o of completedOrders) {
        COMPLETED.push(skinnyOrder(o, [], boardExtras(o)));
      }

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      PRODUCTION_READY,
      PRINTING,
      QC,
      COMPLETED,
      STUCK,
    };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.error("[production-board]", msg);
    return { ok: false, error: msg };
  }
}

/**
 * @param {import("express").Application} app
 */
function mountProductionBoard(app) {
  app.get("/api/production-board", async (_req, res) => {
    const payload = await buildProductionBoardPayload();
    if (!payload.ok) {
      const code = payload.error === "prisma_unavailable" ? 503 : 500;
      return res.status(code).json(payload);
    }
    return res.json(payload);
  });
}

module.exports = { mountProductionBoard, buildProductionBoardPayload };
