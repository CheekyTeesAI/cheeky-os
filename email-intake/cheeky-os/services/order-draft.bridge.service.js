"use strict";

/**
 * Bridge closer review output → internal quote draft (never a final order).
 */

const { saveJson, loadJson } = require("./json.queue.persistence.service");

const QUOTE_FILE = "quote-drafts.json";

function createQuoteDraftFromCloserReview(review) {
  try {
    if (!review || !review.orderDraft) {
      return null;
    }
    const od = review.orderDraft;
    const det = review.orderDetails || {};

    return {
      source: "closer_review",
      status: "quote_draft_needs_review",
      inboundId: review.inboundId || null,
      customerEmail: od.customerEmail || null,
      customerName: od.customerName || det.customerName || null,
      estimatedQuantity: od.estimatedQuantity ?? det.estimatedQuantity ?? null,
      productType: od.productType ?? det.productType ?? null,
      decorationMethod: od.decorationMethod ?? det.decorationMethod ?? null,
      deadlineMentioned: od.deadlineMentioned ?? det.deadlineMentioned ?? null,
      depositRequired: true,
      productionBlockedUntilDeposit: true,
      blankPurchaseBlockedUntilDeposit: true,
      requiresHumanApproval: true,
      createdAt: new Date().toISOString(),
    };
  } catch (_) {
    return null;
  }
}

function persistQuoteDraft(draft) {
  if (!draft) return false;
  const existing = loadJson(QUOTE_FILE, []);
  const list = Array.isArray(existing) ? [...existing] : [];
  list.push(draft);
  saveJson(QUOTE_FILE, list);
  return true;
}

function listQuoteDrafts() {
  const existing = loadJson(QUOTE_FILE, []);
  return Array.isArray(existing) ? existing : [];
}

module.exports = {
  createQuoteDraftFromCloserReview,
  persistQuoteDraft,
  listQuoteDrafts,
  QUOTE_FILE,
};
