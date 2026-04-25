"use strict";

const releaseGateEngine = require("./releaseGateEngine");

module.exports = function orderReadinessEngine(input = {}) {
  try {
    const gate = releaseGateEngine(input);

    return {
      orderReady: gate.allowed,
      productionHold: !gate.allowed,
      releaseStatus: gate.releaseStatus,
      reason: gate.reason,
    };
  } catch (_) {
    return {
      orderReady: false,
      productionHold: true,
      releaseStatus: "BLOCKED",
      reason: "Order readiness error",
    };
  }
};
