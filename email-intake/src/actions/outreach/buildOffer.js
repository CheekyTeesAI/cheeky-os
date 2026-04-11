"use strict";

/**
 * Map score tier to offer shape.
 * @param {string} scoreTier HOT | WARM | COLD
 * @returns {{ offerType: string, incentive: string }}
 */
function buildOffer(scoreTier) {
  const t = String(scoreTier || "").toUpperCase();
  if (t === "HOT") {
    return {
      offerType: "urgency_only",
      incentive: "none — priority lane; no discount"
    };
  }
  if (t === "WARM") {
    return {
      offerType: "value_add",
      incentive: "free setup or complimentary rush on this run"
    };
  }
  return {
    offerType: "reactivation",
    incentive: "10% off first line or bundle pricing on multi-style orders"
  };
}

module.exports = { buildOffer };
