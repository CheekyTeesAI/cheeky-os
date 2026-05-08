"use strict";

/**
 * PHASE 1 — Conversion classifier for inbound closer flow.
 */

function classifyMessage(message) {
  try {
    const text = `${message.subject || ""} ${message.body || ""}`.toLowerCase();

    if (text.includes("pay") || text.includes("invoice") || text.includes("deposit")) {
      return "payment_ready";
    }

    if (text.includes("quote") || text.includes("price") || text.includes("how much")) {
      return "quote_request";
    }

    if (text.includes("order") || text.includes("shirts") || text.includes("hoodies")) {
      return "order_interest";
    }

    if (text.includes("ready") || text.includes("pickup") || text.includes("status")) {
      return "status_request";
    }

    return "general_reply";
  } catch (_) {
    return "general_reply";
  }
}

module.exports = { classifyMessage };
