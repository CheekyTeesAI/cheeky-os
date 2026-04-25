"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Guard target: production transitions (PRODUCTION_READY, PRINTING)
// - Rule: fail closed unless depositPaidAt is verified

function canEnterProduction(order) {
  try {
    if (!order || typeof order !== "object") return false;
    return !!order.depositPaidAt;
  } catch (_) {
    return false;
  }
}

module.exports = {
  canEnterProduction,
};
