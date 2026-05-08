"use strict";

/**
 * PHASE 5 — Internal task draft (not persisted to Prisma; operator review only).
 */

function buildTaskDraft({ message, classification, orderDetails, nextAction }) {
  try {
    return {
      title: `Review inbound: ${classification}`,
      type: classification,
      priority: nextAction.priority,
      customerEmail: message.from || null,
      relatedInvoiceId: message.matchedInvoiceId || null,
      orderId: message.orderId || null,
      action: nextAction.action,
      cashImpact: nextAction.cashImpact,
      orderDetails,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
  } catch (_) {
    return {
      title: "Review inbound",
      type: "unknown",
      priority: "LOW",
      customerEmail: null,
      relatedInvoiceId: null,
      orderId: null,
      action: "Review manually",
      cashImpact: "Unknown",
      orderDetails: {},
      status: "draft",
      createdAt: new Date().toISOString(),
    };
  }
}

module.exports = { buildTaskDraft };
