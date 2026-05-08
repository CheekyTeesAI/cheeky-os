"use strict";

/**
 * Purchase plan builder — stages plans only; never purchases.
 */

const path = require("path");
const store = require("./purchasing.store");
const { selectVendorForItem } = require("./vendorSelect.service");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function parseDescriptionHints(description) {
  const d = String(description || "");
  let color = "";
  let size = "";
  const colorMatch = d.match(/\b(?:color|clr)[:\s]+([a-z0-9#/]+)/i);
  if (colorMatch) color = colorMatch[1];
  const sizeMatch = d.match(/\b(?:size)[:\s]+([xsml0-9]+(?:xl|XL)?)/i);
  if (sizeMatch) size = sizeMatch[1];
  return { color, size };
}

/**
 * @param {string} orderId
 * @param {{ force?: boolean }} opts
 */
async function buildPurchasePlanForOrder(orderId, opts) {
  const oid = String(orderId || "").trim();
  if (!oid) {
    return { ok: false, error: "order_id_required" };
  }

  const existing = store.findActivePlanForOrder(oid);
  if (existing && !(opts && opts.force)) {
    console.log(`[purchasing] PURCHASE PLAN SKIPPED duplicate orderId=${oid}`);
    return { ok: true, skipped: true, plan: existing, reason: "duplicate_active_plan" };
  }

  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    const plan = blockedPlan(oid, "prisma_unavailable", []);
    store.savePlan(plan);
    console.log(`[purchasing] PURCHASE PLAN BLOCKED orderId=${oid} reason=prisma_unavailable`);
    return { ok: true, plan };
  }

  let order;
  try {
    order = await prisma.order.findFirst({
      where: { id: oid, deletedAt: null },
      include: {
        lineItems: { take: 50, orderBy: { createdAt: "asc" } },
        vendorOrders: { take: 5, select: { id: true, status: true } },
      },
    });
  } catch (e) {
    const plan = blockedPlan(oid, e instanceof Error ? e.message : String(e), []);
    store.savePlan(plan);
    console.log(`[purchasing] PURCHASE PLAN BLOCKED orderId=${oid} reason=db_error`);
    return { ok: true, plan };
  }

  if (!order) {
    const plan = blockedPlan(oid, "order_not_found", []);
    store.savePlan(plan);
    console.log(`[purchasing] PURCHASE PLAN BLOCKED orderId=${oid} reason=order_not_found`);
    return { ok: true, plan };
  }

  if (!order.depositPaidAt) {
    const plan = blockedPlan(oid, "no_deposit_paid_at", []);
    store.savePlan(plan);
    console.log(`[purchasing] PURCHASE PLAN BLOCKED orderId=${oid} reason=no_deposit`);
    return { ok: true, plan };
  }

  const st = String(order.status || "").toUpperCase();
  if (!["PRODUCTION_READY", "PRINTING"].includes(st)) {
    const plan = blockedPlan(oid, `status_not_ready:${st}`, []);
    store.savePlan(plan);
    console.log(`[purchasing] PURCHASE PLAN BLOCKED orderId=${oid} reason=bad_status`);
    return { ok: true, plan };
  }

  /** @type {object[]} */
  const items = [];
  let totalCostCents = 0;
  const vendors = new Set();

  let lineRows = order.lineItems && order.lineItems.length ? order.lineItems.slice() : [];
  if (!lineRows.length) {
    const hints = parseOrderLevelProduct(order);
    if (hints) {
      lineRows.push({
        id: "synthetic",
        description: hints.description,
        quantity: hints.quantity,
        unitPrice: hints.unitPrice,
        productionType: order.productionTypeFinal || order.printMethod || null,
      });
    }
  }

  for (const li of lineRows) {
    const qty = Math.max(1, Number(li.quantity || 1));
    const unitPrice = Number(li.unitPrice || 0);
    const hints = parseDescriptionHints(li.description);
    const estUnitCents =
      unitPrice > 0
        ? Math.round(unitPrice * 0.42 * 100)
        : order.estimatedCost != null && lineRows.length > 0
          ? Math.round((Number(order.estimatedCost) / lineRows.length / qty) * 100)
          : 0;
    const lineTotalCents = estUnitCents * qty;
    totalCostCents += lineTotalCents;

    const sel = selectVendorForItem({
      product: li.description,
      description: li.description,
      sku: "",
      color: hints.color,
      size: hints.size,
      quantity: qty,
      vendorName: order.garmentVendor || "",
      productionType: li.productionType || order.productionTypeFinal || "",
    });

    vendors.add(sel.vendorName);

    items.push({
      id: store.newId("pitem"),
      product: String(li.description || "Blank").slice(0, 300),
      sku: "",
      color: hints.color || null,
      size: hints.size || null,
      quantity: qty,
      unitCost: estUnitCents,
      totalCost: lineTotalCents,
      vendorName: sel.vendorName,
      notes: `${sel.confidence}: ${sel.reason}${sel.requiresManualReview ? " · manual_review" : ""}`,
    });
  }

  if (!items.length) {
    const plan = blockedPlan(oid, "no_line_items", []);
    store.savePlan(plan);
    console.log(`[purchasing] PURCHASE PLAN BLOCKED orderId=${oid} reason=no_items`);
    return { ok: true, plan };
  }

  const amountPaidCents = Math.round(Number(order.amountPaid || 0) * 100);
  const coveredByDeposit = totalCostCents <= 0 ? true : amountPaidCents >= totalCostCents - 100;

  let manualReview = items.some((it) => /manual_review|MANUAL_REVIEW/i.test(String(it.notes)));
  if (items.some((it) => String(it.vendorName).toUpperCase() === "MANUAL_REVIEW")) manualReview = true;

  const vendorName =
    vendors.size === 1 ? Array.from(vendors)[0] : `Multiple (${Array.from(vendors).slice(0, 3).join(", ")})`;

  const now = new Date().toISOString();
  let status = "NEEDS_APPROVAL";
  let blockedReason= "";
  let notes = `Built from order ${order.orderNumber || oid}. Deposit paid at recorded.`;

  if (!coveredByDeposit) {
    status = "BLOCKED";
    blockedReason = `insufficient_deposit_for_blanks:need=${totalCostCents}c have=${amountPaidCents}c`;
    notes = `Blocked: estimated blank cost $${(totalCostCents / 100).toFixed(2)} vs amount paid $${(amountPaidCents / 100).toFixed(2)}.`;
    console.log(`[purchasing] PURCHASE PLAN BLOCKED orderId=${oid} reason=insufficient_deposit`);
  } else if (manualReview) {
    status = "DRAFT";
    notes += " Review vendors/SKUs before approval.";
  }

  const plan = {
    id: store.newId("pplan"),
    orderId: oid,
    vendorId: null,
    vendorName,
    status,
    totalCost: totalCostCents,
    coveredByDeposit,
    approvalRequired: status !== "BLOCKED",
    approvedAt: null,
    orderedAt: null,
    receivedAt: null,
    vendorOrderNumber: null,
    blockedReason: blockedReason || null,
    notes,
    items,
    customerName: order.customerName || "",
    orderNumber: order.orderNumber || null,
    createdAt: now,
    updatedAt: now,
  };

  store.savePlan(plan);
  console.log(`[purchasing] PURCHASE PLAN CREATED orderId=${oid} planId=${plan.id} status=${status}`);
  return { ok: true, plan };
}

function parseOrderLevelProduct(order) {
  const q = Number(order.quantity || 0);
  if (!order.garmentType && !q) return null;
  const desc =
    [order.garmentType, order.printMethod, order.productionTypeFinal].filter(Boolean).join(" · ") || "Garment";
  const unitPrice = Number(order.unitPrice || order.quotedAmount || order.totalAmount || 0);
  return {
    description: desc,
    quantity: Math.max(1, q || 1),
    unitPrice: unitPrice > 0 ? unitPrice / Math.max(1, q || 1) : 0,
  };
}

function blockedPlan(orderId, reason, items) {
  const now = new Date().toISOString();
  return {
    id: store.newId("pplan"),
    orderId: String(orderId),
    vendorId: null,
    vendorName: "—",
    status: "BLOCKED",
    totalCost: 0,
    coveredByDeposit: false,
    approvalRequired: false,
    approvedAt: null,
    orderedAt: null,
    receivedAt: null,
    vendorOrderNumber: null,
    blockedReason: reason,
    notes: `Blocked: ${reason}`,
    items,
    customerName: "",
    orderNumber: null,
    createdAt: now,
    updatedAt: now,
  };
}

function ownerPurchasingSnapshot() {
  const plans = store.listPlans();
  let needsApproval = 0;
  let blocked = 0;
  let orderedNotReceived = 0;
  let estimatedSpendPending = 0;

  for (const p of plans) {
    const s = String(p.status || "").toUpperCase();
    if (s === "NEEDS_APPROVAL" || s === "DRAFT") {
      needsApproval += 1;
      if (s === "NEEDS_APPROVAL") estimatedSpendPending += Math.round(Number(p.totalCost || 0));
    }
    if (s === "BLOCKED") blocked += 1;
    if (s === "ORDERED" || s === "PARTIALLY_RECEIVED") {
      orderedNotReceived += 1;
    }
    if (s === "APPROVED") {
      estimatedSpendPending += Math.round(Number(p.totalCost || 0));
    }
  }

  return { needsApproval, blocked, orderedNotReceived, estimatedSpendPending };
}

/**
 * @param {string} orderId
 */
function getPlanBoardExtras(orderId) {
  const p = store.findActivePlanForOrder(String(orderId || ""));
  if (!p) {
    return {
      purchasePlanId: null,
      purchasePlanStatus: null,
      purchasingBlocked: false,
      vendorName: null,
      blankCostCovered: null,
      receivedAt: null,
      purchasingWarnings: [],
    };
  }
  const s = String(p.status || "").toUpperCase();
  const warnings = [];
  if (s === "BLOCKED") warnings.push("Blank purchase blocked");
  else if (s === "NEEDS_APPROVAL" || s === "DRAFT") warnings.push("Purchase awaiting approval");
  else if (s === "APPROVED") warnings.push("Blanks not ordered");
  else if (s === "ORDERED" || s === "PARTIALLY_RECEIVED") warnings.push("Blanks ordered, not received");
  if (!p.coveredByDeposit && s !== "BLOCKED") warnings.push("Deposit may not cover estimated blanks");

  return {
    purchasePlanId: p.id,
    purchasePlanStatus: s,
    purchasingBlocked: s === "BLOCKED",
    vendorName: p.vendorName || null,
    blankCostCovered: !!p.coveredByDeposit,
    receivedAt: p.receivedAt || null,
    purchasingWarnings: warnings,
  };
}

module.exports = {
  buildPurchasePlanForOrder,
  ownerPurchasingSnapshot,
  getPlanBoardExtras,
};
