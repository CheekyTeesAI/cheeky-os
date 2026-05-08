"use strict";

const crypto = require("crypto");

function newId(prefix) {
  try {
    if (typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
  } catch (_e) {}
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

const METHODS = ["DTG", "DTF", "SCREEN_PRINT", "EMBROIDERY", "STICKERS", "UNKNOWN"];

/**
 * @param {object} body
 */
function buildWorkOrderDraft(body) {
  const b = body && typeof body === "object" ? body : {};
  const method = String(b.productionMethod || b.printMethod || "UNKNOWN").toUpperCase();
  const draft = {
    id: newId("wo"),
    createdAt: new Date().toISOString(),
    approvalStatus: "DRAFT",
    approvalRequired: true,
    customer: {
      name: String(b.customerName || b.customer?.name || "").trim(),
      email: String(b.customerEmail || b.customer?.email || "").trim(),
      phone: b.customerPhone || b.customer?.phone || null,
    },
    orderSource: String(b.orderSource || b.source || "unknown").slice(0, 120),
    square: {
      invoiceId: b.squareInvoiceId || null,
      estimateId: b.squareEstimateId || null,
      invoiceNumber: b.squareInvoiceNumber || null,
    },
    deposit: {
      expected: b.depositRequired != null ? Number(b.depositRequired) : null,
      received: !!b.depositReceived,
      paid: !!b.depositPaid,
      status: b.depositStatus || null,
    },
    art: {
      status: b.artApprovalStatus || b.artStatus || "UNKNOWN",
      filesNeeded: Array.isArray(b.filesNeeded) ? b.filesNeeded : [],
      notes: b.artNotes || null,
    },
    productionMethod: METHODS.includes(method) ? method : "UNKNOWN",
    fulfillment: String(b.inHouse === false ? "outsource" : b.fulfillment || "in_house"),
    garments: Array.isArray(b.garments) ? b.garments : [],
    garmentNotes: b.garmentNotes || null,
    printLocations: Array.isArray(b.printLocations) ? b.printLocations : [],
    dueDate: b.dueDate || null,
    notes: String(b.notes || "").slice(0, 4000),
    internalRefs: {
      prismaOrderId: b.orderId || null,
      orderNumber: b.orderNumber || null,
    },
  };

  const missing = [];
  if (!draft.customer.name) missing.push("customer.name");
  if (!draft.customer.email && !draft.internalRefs.prismaOrderId) missing.push("customer.email_or_order_link");
  return { draft, missing };
}

function validateMinimalDraft(body) {
  const { draft, missing } = buildWorkOrderDraft(body);
  return { ok: missing.length === 0, draft, missing };
}

module.exports = {
  buildWorkOrderDraft,
  validateMinimalDraft,
  METHODS,
};
