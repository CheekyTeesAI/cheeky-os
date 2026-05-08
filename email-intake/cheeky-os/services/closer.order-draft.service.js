"use strict";

/**
 * PHASE 6 — Order draft structure (quote path only). Never creates DB rows here.
 */

function extractEmailFrom(from) {
  const raw = String(from || "").trim();
  const angle = raw.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  if (raw.includes("@")) return raw;
  return null;
}

function buildOrderDraft({ message, classification, orderDetails }) {
  try {
    if (!["quote_request", "order_interest"].includes(classification)) {
      return null;
    }

    return {
      source: "inbound_email",
      customerEmail: extractEmailFrom(message.from) || message.from || null,
      customerName: message.matchedCustomerName || null,
      estimatedQuantity: orderDetails.estimatedQuantity,
      productType: orderDetails.productType,
      decorationMethod: orderDetails.decorationMethod,
      deadlineMentioned: orderDetails.deadlineMentioned,
      depositRequired: true,
      productionBlockedUntilDeposit: true,
      blankPurchaseBlockedUntilDeposit: true,
      status: "draft_quote_needed",
      createdAt: new Date().toISOString(),
    };
  } catch (_) {
    return null;
  }
}

module.exports = { buildOrderDraft };
