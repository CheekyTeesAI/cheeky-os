"use strict";

/**
 * PHASE 3 — Next action recommendations (reviewable only; no auto-send).
 */

function getNextAction({ classification, orderDetails }) {
  try {
    if (classification === "payment_ready") {
      return {
        priority: "HIGH",
        action: "Send payment link or confirm invoice status",
        cashImpact: "Immediate",
      };
    }

    if (classification === "quote_request") {
      return {
        priority: "HIGH",
        action: "Prepare quote and request missing production details",
        cashImpact: "High",
      };
    }

    if (classification === "order_interest") {
      return {
        priority: "HIGH",
        action: "Convert inquiry into quote draft",
        cashImpact: "High",
      };
    }

    if (classification === "status_request") {
      return {
        priority: "MEDIUM",
        action: "Check production status and respond",
        cashImpact: "Retention",
      };
    }

    return {
      priority: "LOW",
      action: "Review manually",
      cashImpact: "Unknown",
    };
  } catch (_) {
    return {
      priority: "LOW",
      action: "Review manually",
      cashImpact: "Unknown",
    };
  }
}

module.exports = { getNextAction };
