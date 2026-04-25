"use strict";

const { normalizeForDecision } = require("./decisionEngine");

/**
 * Block production when deposit or garments preconditions fail (drafts / UI messaging only).
 */
function canStartProduction(order) {
  const n = normalizeForDecision(order);
  if (!n.depositPaid) {
    return {
      allowed: false,
      code: "NO_DEPOSIT",
      message: "Production blocked until deposit is collected.",
    };
  }
  if (!n.garmentsReceived) {
    return {
      allowed: false,
      code: "NO_GARMENTS",
      message: "Production blocked until garments are received.",
    };
  }
  return { allowed: true, code: null, message: null };
}

module.exports = {
  canStartProduction,
};
