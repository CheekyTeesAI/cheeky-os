"use strict";

const path = require("path");
const store = require("./fulfillmentRecords.store");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

const METHODS = new Set(["PICKUP", "LOCAL_DELIVERY", "SHIP", "UNKNOWN"]);
const STATUSES = new Set([
  "NOT_READY",
  "READY",
  "STAGED",
  "SHIPPED",
  "PICKED_UP",
  "NEEDS_REVIEW",
]);

function isOrderCompletedLike(order) {
  if (!order) return false;
  const s = String(order.status || "").toUpperCase();
  if (s === "COMPLETED" || s === "READY") return true;
  if (order.completedAt) return true;
  return false;
}

function balanceDueOnOrder(order) {
  const tot =
    Number(order.totalAmount ?? 0) ||
    Number(order.amountTotal ?? 0) ||
    Number(order.quotedAmount ?? 0) ||
    Number(order.total ?? 0) ||
    0;
  const paid = Number(order.amountPaid ?? 0) || 0;
  return Math.round(Math.max(0, tot - paid) * 100) / 100;
}

function shipAddressComplete(rec) {
  const name = String(rec.shippingName || "").trim();
  const a1 = String(rec.shippingAddress1 || "").trim();
  const city = String(rec.shippingCity || "").trim();
  const st = String(rec.shippingState || "").trim();
  const zip = String(rec.shippingZip || "").trim();
  const w = rec.packageWeightOz != null && Number(rec.packageWeightOz) > 0;
  return !!(name && a1 && city && st && zip && w);
}

function reasonNeedsReview(rec, method, order) {
  if (!method || method === "UNKNOWN") return "fulfillment_method_not_set";
  if (method === "SHIP" && !shipAddressComplete(rec)) return "ship_missing_address_or_weight";
  return "unknown";
}

/**
 * Evaluate and persist fulfillmentStatus (+ log). Optionally create comms drafts (idempotent).
 * @param {string} orderId
 * @param {{ skipDrafts?: boolean }} opts
 */
async function evaluateFulfillment(orderId, opts) {
  const skipDrafts = !!(opts && opts.skipDrafts);
  const oid = String(orderId || "").trim();
  const out = {
    ok: false,
    orderId: oid,
    fulfillmentMethod: "UNKNOWN",
    fulfillmentStatus: "NOT_READY",
    reason: null,
    record: null,
  };

  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    out.reason = "database_unavailable";
    return out;
  }

  let order;
  try {
    order = await prisma.order.findFirst({
      where: { id: oid, deletedAt: null },
    });
  } catch (e) {
    out.reason = e instanceof Error ? e.message : String(e);
    return out;
  }

  if (!order) {
    out.reason = "order_not_found";
    return out;
  }

  let rec = store.getRecord(oid);

  const terminalFulfillment = new Set(["SHIPPED", "PICKED_UP"]);
  if (
    isOrderCompletedLike(order) &&
    rec &&
    terminalFulfillment.has(String(rec.fulfillmentStatus || "").toUpperCase())
  ) {
    out.ok = true;
    out.fulfillmentMethod = rec.fulfillmentMethod;
    out.fulfillmentStatus = String(rec.fulfillmentStatus || "").toUpperCase();
    out.record = rec;
    return out;
  }

  if (!isOrderCompletedLike(order)) {
    rec = store.saveRecord(oid, { fulfillmentStatus: "NOT_READY" });
    console.log(`[fulfillment] NOT_READY orderId=${oid}`);
    out.ok = true;
    out.fulfillmentMethod = rec.fulfillmentMethod;
    out.fulfillmentStatus = "NOT_READY";
    out.record = rec;
    return out;
  }

  const method = String(rec.fulfillmentMethod || "UNKNOWN").toUpperCase();
  const effectiveMethod = METHODS.has(method) ? method : "UNKNOWN";

  if (!effectiveMethod || effectiveMethod === "UNKNOWN") {
    rec = store.saveRecord(oid, { fulfillmentStatus: "NEEDS_REVIEW", fulfillmentMethod: "UNKNOWN" });
    console.log(`[fulfillment] NEEDS REVIEW orderId=${oid} reason=fulfillment_method_missing`);
    out.ok = true;
    out.fulfillmentStatus = "NEEDS_REVIEW";
    out.reason = "fulfillment_method_missing";
    out.record = rec;
    if (!skipDrafts) await maybeEnsureCommsDrafts(oid, order, rec, "METHOD_UNSET");
    return out;
  }

  rec = store.saveRecord(oid, { fulfillmentMethod: effectiveMethod });

  if (effectiveMethod === "PICKUP") {
    rec = store.saveRecord(oid, { fulfillmentStatus: "READY" });
    console.log(`[fulfillment] READY FOR PICKUP orderId=${oid}`);
    out.ok = true;
    out.fulfillmentMethod = "PICKUP";
    out.fulfillmentStatus = "READY";
    out.record = rec;
    if (!skipDrafts) await maybeEnsureCommsDrafts(oid, order, rec, "READY");
    return out;
  }

  if (effectiveMethod === "LOCAL_DELIVERY") {
    rec = store.saveRecord(oid, { fulfillmentStatus: "STAGED" });
    console.log(`[fulfillment] SHIPPING STAGED orderId=${oid} mode=local_delivery`);
    out.ok = true;
    out.fulfillmentMethod = "LOCAL_DELIVERY";
    out.fulfillmentStatus = "STAGED";
    out.record = rec;
    if (!skipDrafts) await maybeEnsureCommsDrafts(oid, order, rec, "STAGED");
    return out;
  }

  if (effectiveMethod === "SHIP") {
    if (!shipAddressComplete(rec)) {
      const r = reasonNeedsReview(rec, "SHIP", order);
      rec = store.saveRecord(oid, { fulfillmentStatus: "NEEDS_REVIEW" });
      console.log(`[fulfillment] NEEDS REVIEW orderId=${oid} reason=${r}`);
      out.ok = true;
      out.fulfillmentMethod = "SHIP";
      out.fulfillmentStatus = "NEEDS_REVIEW";
      out.reason = r;
      out.record = rec;
      if (!skipDrafts) await maybeEnsureCommsDrafts(oid, order, rec, "NEEDS_REVIEW_SHIP");
      return out;
    }
    rec = store.saveRecord(oid, { fulfillmentStatus: "STAGED" });
    console.log(`[fulfillment] SHIPPING STAGED orderId=${oid} mode=ship`);
    out.ok = true;
    out.fulfillmentMethod = "SHIP";
    out.fulfillmentStatus = "STAGED";
    out.record = rec;
    if (!skipDrafts) await maybeEnsureCommsDrafts(oid, order, rec, "STAGED_SHIP");
    return out;
  }

  rec = store.saveRecord(oid, { fulfillmentStatus: "NEEDS_REVIEW" });
  console.log(`[fulfillment] NEEDS REVIEW orderId=${oid} reason=unsupported_method`);
  out.ok = true;
  out.fulfillmentStatus = "NEEDS_REVIEW";
  out.record = rec;
  return out;
}

/**
 * @param {string} phase — READY | STAGED | NEEDS_REVIEW_SHIP | STAGED_SHIP | NEEDS_REVIEW
 */
async function maybeEnsureCommsDrafts(orderId, order, record, phase) {
  try {
    const svc = require("./customerMessageDraft.service");
    const due = balanceDueOnOrder(order);
    if (due > 0.02) {
      const r = await svc.createCustomerMessageDraft(orderId, "BALANCE_DUE", "email");
      if (r && r.ok) {
        console.log(`[fulfillment] CUSTOMER DRAFT CREATED orderId=${orderId} type=BALANCE_DUE`);
      }
      return;
    }
    if (phase === "METHOD_UNSET") {
      return;
    }
    if (phase === "READY") {
      const r = await svc.createCustomerMessageDraft(orderId, "READY_FOR_PICKUP", "email");
      if (r && r.ok) {
        console.log(`[fulfillment] CUSTOMER DRAFT CREATED orderId=${orderId} type=READY_FOR_PICKUP`);
      }
      return;
    }
    if (phase === "NEEDS_REVIEW_SHIP") {
      const r = await svc.createCustomerMessageDraft(orderId, "SHIPPING_ADDRESS_NEEDED", "email");
      if (r && r.ok) {
        console.log(`[fulfillment] CUSTOMER DRAFT CREATED orderId=${orderId} type=SHIPPING_ADDRESS_NEEDED`);
      }
      return;
    }
    if (phase === "STAGED") {
      const r = await svc.createCustomerMessageDraft(orderId, "LOCAL_DELIVERY_STAGED", "email");
      if (r && r.ok) {
        console.log(`[fulfillment] CUSTOMER DRAFT CREATED orderId=${orderId} type=LOCAL_DELIVERY_STAGED`);
      }
      return;
    }
    if (phase === "STAGED_SHIP") {
      const r = await svc.createCustomerMessageDraft(orderId, "SHIPPING_STAGED", "email");
      if (r && r.ok) {
        console.log(`[fulfillment] CUSTOMER DRAFT CREATED orderId=${orderId} type=SHIPPING_STAGED`);
      }
    }
  } catch (e) {
    console.warn("[fulfillment] comms draft skipped:", e && e.message ? e.message : e);
  }
}

function buildPirateShipShipmentDraft(orderId) {
  const oid = String(orderId || "").trim();
  const rec = store.getRecord(oid);
  const prisma = getPrisma();
  const out = {
    orderId: oid,
    recipient: {
      name: rec.shippingName || "",
      phone: rec.shippingPhone || "",
    },
    address: {
      line1: rec.shippingAddress1,
      line2: rec.shippingAddress2 || "",
      city: rec.shippingCity,
      state: rec.shippingState,
      zip: rec.shippingZip,
      country: rec.shippingCountry || "US",
    },
    package: {
      weightOz: rec.packageWeightOz,
      lengthIn: rec.packageLengthIn,
      widthIn: rec.packageWidthIn,
      heightIn: rec.packageHeightIn,
    },
    reference: `Cheeky-${oid.slice(0, 8)}`,
    notes: rec.fulfillmentNote || "",
  };
  return out;
}

/**
 * Light metrics for owner/operator without full queue scan cost.
 */
async function getFulfillmentMetrics() {
  const metrics = {
    pickupReady: 0,
    shippingStaged: 0,
    needsReview: 0,
    completedToday: 0,
  };
  start.setHours(0, 0, 0, 0);

  for (const rec of store.listAllRecords()) {
    const st = String(rec.fulfillmentStatus || "").toUpperCase();
    if (st === "READY") metrics.pickupReady += 1;
    else if (st === "STAGED") metrics.shippingStaged += 1;
    else if (st === "NEEDS_REVIEW") metrics.needsReview += 1;
    if (
      (st === "SHIPPED" || st === "PICKED_UP") &&
      rec.fulfilledAt &&
      new Date(rec.fulfilledAt) >= start
    ) {
      metrics.completedToday += 1;
    }
  }
  return metrics;
}

function summarizeAddress(rec) {
  const parts = [
    rec.shippingAddress1,
    rec.shippingCity,
    rec.shippingState,
    rec.shippingZip,
  ].filter((x) => String(x || "").trim());
  return parts.join(", ");
}

/**
 * @param {object} order
 * @param {object} rec
 */
function skinnyQueueRow(order, rec) {
  return {
    orderId: order.id,
    customerName: order.customerName,
    email: order.email,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    fulfillmentMethod: rec.fulfillmentMethod,
    fulfillmentStatus: rec.fulfillmentStatus,
    addressSummary: summarizeAddress(rec),
    package: {
      weightOz: rec.packageWeightOz,
      lengthIn: rec.packageLengthIn,
      widthIn: rec.packageWidthIn,
      heightIn: rec.packageHeightIn,
    },
    trackingNumber: rec.trackingNumber || "",
    carrier: rec.carrier || "",
    note: rec.fulfillmentNote || "",
    balanceDue: balanceDueOnOrder(order),
  };
}

/**
 * Completed-style orders only; syncs JSON + engine state without creating comms drafts.
 * @returns {Promise<object>}
 */
async function buildFulfillmentQueuePayload() {
  const pickupReady = [];
  const shippingStaged = [];
  const needsReview = [];
  const completed = [];
  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    return {
      ok: true,
      pickupReady,
      shippingStaged,
      needsReview,
      completed,
      metrics: { pickupReady: 0, shippingStaged: 0, needsReview: 0, completed: 0 },
      timestamp: new Date().toISOString(),
      error: "database_unavailable",
    };
  }

  let orders = [];
  try {
    orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        OR: [
          { status: { in: ["READY", "COMPLETED"] } },
          { completedAt: { not: null } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 400,
      select: {
        id: true,
        customerName: true,
        email: true,
        orderNumber: true,
        status: true,
        completedAt: true,
        totalAmount: true,
        quotedAmount: true,
        total: true,
        amountPaid: true,
        amountTotal: true,
      },
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      pickupReady,
      shippingStaged,
      needsReview,
      completed,
      metrics: { pickupReady: 0, shippingStaged: 0, needsReview: 0, completed: 0 },
      timestamp: new Date().toISOString(),
    };
  }

  for (const o of orders) {
    try {
      await evaluateFulfillment(o.id, { skipDrafts: true });
    } catch (_ev) {
      /* keep row best-effort */
    }
    const rec = store.getRecord(o.id);
    const row = skinnyQueueRow(o, rec);
    const st = String(rec.fulfillmentStatus || "").toUpperCase();
    if (st === "SHIPPED" || st === "PICKED_UP") completed.push(row);
    else if (st === "READY") pickupReady.push(row);
    else if (st === "STAGED") shippingStaged.push(row);
    else if (st === "NEEDS_REVIEW") needsReview.push(row);
  }

  return {
    ok: true,
    pickupReady,
    shippingStaged,
    needsReview,
    completed,
    metrics: {
      pickupReady: pickupReady.length,
      shippingStaged: shippingStaged.length,
      needsReview: needsReview.length,
      completed: completed.length,
    },
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  evaluateFulfillment,
  buildPirateShipShipmentDraft,
  getFulfillmentMetrics,
  buildFulfillmentQueuePayload,
  balanceDueOnOrder,
  isOrderCompletedLike,
  shipAddressComplete,
  METHODS,
  STATUSES,
};
