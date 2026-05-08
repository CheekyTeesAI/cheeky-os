"use strict";

/**
 * PHASE 5 — Opportunity detection from inbound text.
 */

/**
 * @param {object} message
 * @returns {string}
 */
function detectOpportunity(message) {
  try {
    const text = `${message.subject || ""} ${message.body || ""}`.toLowerCase();

    if (text.includes("pay") || text.includes("invoice") || text.includes("deposit")) {
      return "cash_collection";
    }

    if (text.includes("quote") || text.includes("price") || text.includes("order")) {
      return "sales_opportunity";
    }

    if (text.includes("ready") || text.includes("pickup")) {
      return "production_status";
    }

    return "general";
  } catch (_) {
    return "general";
  }
}

module.exports = { detectOpportunity };
