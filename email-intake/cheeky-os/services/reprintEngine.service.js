"use strict";

/**
 * Reprint evaluation — staging only; never auto-purchases or auto-contacts.
 */

const path = require("path");
const fs = require("fs");
const store = require("./qc.store");

function inventoryFilePath() {
  return path.join(__dirname, "..", "..", "..", "data", "inventory.json");
}

function loadInventoryItems() {
  try {
    const p = inventoryFilePath();
    if (!fs.existsSync(p)) return [];
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const items = j && Array.isArray(j.items) ? j.items : [];
    return items;
  } catch (_e) {
    return [];
  }
}

/**
 * Heuristic stock check: if inventory empty, treat as unknown (not sufficient).
 * @param {object[]} lineHints { quantity, description }
 */
function evaluateInventoryForHints(hints) {
  const items = loadInventoryItems();
  if (!items.length) {
    return { sufficient: false, uncertain: true, reason: "no_inventory_rows" };
  }
  /** Very light match: any item with qty > 0 counts as possible stock */
  const available = items.filter((x) => Number(x.quantity || x.qty || 0) > 0);
  if (!available.length) {
    return { sufficient: false, uncertain: false, reason: "zero_stock_lines" };
  }
  const needQty = hints.reduce((s, h) => s + Math.max(1, Number(h.quantity || 1)), 0);
  const have = available.reduce((s, x) => s + Math.max(0, Number(x.quantity || x.qty || 0)), 0);
  if (have >= needQty) return { sufficient: true, uncertain: false, reason: "aggregate_qty_ok" };
  return { sufficient: false, uncertain: false, reason: "aggregate_qty_short" };
}

/**
 * @param {string} orderId
 * @param {object} qcCheck FAIL check
 * @param {object} order prisma row with lineItems optional
 */
async function evaluateReprint(orderId, qcCheck, order) {
  const oid = String(orderId || "").trim();
  if (!oid || !qcCheck || String(qcCheck.status || "").toUpperCase() !== "FAIL") {
    return { ok: false, error: "invalid_reprint" };
  }

  const existing = findOpenReprintPlanScoped(oid);
  if (existing) {
    console.log(`[qc] REPRINT PLAN exists orderId=${oid} planId=${existing.id}`);
    return { ok: true, plan: existing, duplicate: true };
  }

  if (!order || !order.depositPaidAt) {
    console.log(`[qc] REPRINT BLOCKED no_deposit orderId=${oid}`);
    return {
      ok: true,
      plan: createBlockedPlan(oid, qcCheck.id, "no_deposit_paid_at"),
      blocked: true,
    };
  }

  const hints = buildLineHints(order);
  const inv = evaluateInventoryForHints(hints);
  const productionBlocked = !inv.sufficient;
  const now = new Date().toISOString();
  const plan = {
    id: store.newId("rplan"),
    orderId: oid,
    qcCheckId: qcCheck.id,
    status: "OPEN",
    needsReprint: true,
    items: hints.map((h) => ({
      product: h.description,
      quantity: h.quantity,
      notes: "reprint_from_qc_fail",
    })),
    inventorySufficient: inv.sufficient,
    inventoryUncertain: !!inv.uncertain,
    inventoryReason: inv.reason || "",
    productionBlocked,
    purchasingPlanTriggered: false,
    createdAt: now,
    updatedAt: now,
  };

  if (productionBlocked) {
    try {
      const { buildPurchasePlanForOrder } = require("./purchasingEngine.service");
      const po = await buildPurchasePlanForOrder(oid, {});
      plan.purchasingPlanTriggered = !!(po && po.plan && !po.skipped);
      plan.purchasingNote = po && po.skipped ? "duplicate_or_skip" : "build_attempted";
    } catch (_e) {
      plan.purchasingNote = "build_failed";
    }
  }

  store.saveReprintPlan(plan);
  console.log(`[qc] REPRINT PLAN CREATED orderId=${oid} planId=${plan.id}`);
  console.log(`[qc] REPRINT REQUIRED orderId=${oid}`);
  return { ok: true, plan };
}

function findOpenReprintPlanScoped(orderId) {
  const p = store.findOpenReprintPlan(orderId);
  return p;
}

function createBlockedPlan(orderId, qcCheckId, reason) {
  const now = new Date().toISOString();
  const plan = {
    id: store.newId("rplan"),
    orderId: String(orderId),
    qcCheckId,
    status: "OPEN",
    needsReprint: true,
    items: [],
    inventorySufficient: false,
    inventoryUncertain: false,
    inventoryReason: reason,
    productionBlocked: true,
    purchasingPlanTriggered: false,
    blockedReason: reason,
    createdAt: now,
    updatedAt: now,
  };
  store.saveReprintPlan(plan);
  return plan;
}

function buildLineHints(order) {
  const out = [];
  const lis = order.lineItems && order.lineItems.length ? order.lineItems : [];
  for (const li of lis) {
    out.push({
      description: String(li.description || "item").slice(0, 200),
      quantity: Math.max(1, Number(li.quantity || 1)),
    });
  }
  if (!out.length && (order.garmentType || order.quantity)) {
    out.push({
      description: [order.garmentType, order.printMethod].filter(Boolean).join(" · ") || "Garment",
      quantity: Math.max(1, Number(order.quantity || 1)),
    });
  }
  if (!out.length) {
    out.push({ description: "Order line items unknown", quantity: 1 });
  }
  return out;
}

module.exports = {
  evaluateReprint,
  evaluateInventoryForHints,
  findOpenReprintPlanScoped,
};
