"use strict";

/**
 * Cheeky OS v3.2 — production routing (additive rules).
 * Polyester → DTF; 24+ → SCREEN; default small full color → DTG.
 */
function computeRoutingHint({ garmentType, description, qty }) {
  const d = String(description || "").toLowerCase();
  const g = String(garmentType || "").toLowerCase();
  if (g.includes("poly") || d.includes("polyester")) {
    return { productionType: "DTF", rationale: "Polyester → DTF (v3.2 routing)" };
  }
  const n = Number(qty) || 0;
  if (n >= 24) {
    return { productionType: "SCREEN", rationale: "24+ pieces → SCREENPRINT" };
  }
  return { productionType: "DTG", rationale: "Small full color → DTG" };
}

module.exports = {
  computeRoutingHint,
};
