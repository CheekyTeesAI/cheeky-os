/**
 * Bundle 52 — deterministic in-house vs vendor routing (no DB, no AI).
 */

/**
 * @param {unknown} raw
 * @returns {number}
 */
function toNum(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * @param {string} deadline
 * @returns {boolean}
 */
function isRushDeadline(deadline) {
  const d = String(deadline || "").toLowerCase().trim();
  if (!d) return false;
  if (
    /\brush\b/.test(d) ||
    /\burgent\b/.test(d) ||
    /\basap\b/.test(d) ||
    /\btoday\b/.test(d) ||
    /\btomorrow\b/.test(d) ||
    /\b24\s*h/.test(d) ||
    /\b48\s*h/.test(d)
  ) {
    return true;
  }
  if (/\bin\s*([1-3])\s*days?\b/.test(d)) return true;
  const t = new Date(deadline).getTime();
  if (Number.isFinite(t)) {
    const deltaDays = (t - Date.now()) / (24 * 60 * 60 * 1000);
    if (deltaDays <= 3 && deltaDays >= -1) return true;
  }
  return false;
}

/**
 * @param {number} revenue
 * @param {number} cost
 * @returns {number}
 */
function marginRatio(revenue, cost) {
  if (!Number.isFinite(revenue) || revenue <= 0) return NaN;
  if (!Number.isFinite(cost)) return NaN;
  return (revenue - cost) / revenue;
}

/**
 * @param {{
 *   quantity?: unknown,
 *   garmentType?: unknown,
 *   material?: unknown,
 *   printColors?: unknown,
 *   deadline?: unknown,
 *   estimatedRevenue?: unknown,
 *   estimatedCostInHouse?: unknown,
 *   estimatedCostVendor?: unknown
 * }} raw
 * @returns {{
 *   recommendedRoute: "in_house"|"vendor"|"review",
 *   productionType: "DTG"|"DTF"|"SCREEN_PRINT"|"EMBROIDERY",
 *   reason: string,
 *   marginInHouse: number,
 *   marginVendor: number
 * }}
 */
function computeRoutingDecision(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const quantity = Math.max(0, Math.floor(Number(src.quantity) || 0));
  const garmentType = String(src.garmentType != null ? src.garmentType : "").trim();
  const material = String(src.material != null ? src.material : "")
    .trim()
    .toLowerCase();
  const printColors = Math.max(0, Math.floor(Number(src.printColors) || 0));
  const deadline = String(src.deadline != null ? src.deadline : "").trim();
  const revenue = toNum(src.estimatedRevenue);
  const costInHouse = toNum(src.estimatedCostInHouse);
  const costVendor = toNum(src.estimatedCostVendor);

  const haystack = `${material} ${garmentType}`.toLowerCase();

  /** @type {"DTG"|"DTF"|"SCREEN_PRINT"|"EMBROIDERY"} */
  let productionType = "DTG";

  if (/embroider/.test(haystack)) {
    productionType = "EMBROIDERY";
  } else if (/polyester|100\s*%?\s*poly(?:ester)?/.test(haystack)) {
    productionType = "DTF";
  } else if (/triblend|tri-blend|tri\s*blend/.test(haystack)) {
    productionType = "DTG";
  } else if (printColors >= 2 && quantity >= 24) {
    productionType = "SCREEN_PRINT";
  } else {
    productionType = "DTG";
  }

  if (productionType === "SCREEN_PRINT" && quantity < 24) {
    productionType = "DTG";
  }

  const marginInHouse = marginRatio(revenue, costInHouse);
  const marginVendor = marginRatio(revenue, costVendor);

  if (quantity <= 0 || !Number.isFinite(revenue) || revenue <= 0) {
    return {
      recommendedRoute: "review",
      productionType,
      reason: "Missing quantity or revenue for routing",
      marginInHouse: Number.isFinite(marginInHouse) ? round4(marginInHouse) : 0,
      marginVendor: Number.isFinite(marginVendor) ? round4(marginVendor) : 0,
    };
  }

  if (
    productionType === "EMBROIDERY" &&
    quantity > 0 &&
    quantity < 12
  ) {
    return {
      recommendedRoute: "review",
      productionType,
      reason: "Below 12 pc minimum for embroidery",
      marginInHouse: round4(marginInHouse),
      marginVendor: round4(marginVendor),
    };
  }

  if (!Number.isFinite(marginInHouse) || !Number.isFinite(marginVendor)) {
    return {
      recommendedRoute: "review",
      productionType,
      reason: "Cost data incomplete — needs review",
      marginInHouse: Number.isFinite(marginInHouse) ? round4(marginInHouse) : 0,
      marginVendor: Number.isFinite(marginVendor) ? round4(marginVendor) : 0,
    };
  }

  const rush = isRushDeadline(deadline);
  /** @type {"in_house"|"vendor"|"review"} */
  let recommendedRoute = "in_house";
  /** @type {string[]} */
  const reasonParts = [];

  if (rush) {
    recommendedRoute = "in_house";
    reasonParts.push("rush job → in-house");
  } else if (quantity >= 100 && marginVendor >= marginInHouse) {
    recommendedRoute = "vendor";
    reasonParts.push(`${quantity} pcs`);
    reasonParts.push("vendor margin ≥ in-house");
  } else if (marginVendor > marginInHouse + 0.1) {
    recommendedRoute = "vendor";
    reasonParts.push("vendor margin +10pts vs in-house");
  } else {
    recommendedRoute = "in_house";
    reasonParts.push("in-house path");
  }

  if (
    productionType !== "SCREEN_PRINT" &&
    quantity > 0 &&
    quantity < 12
  ) {
    reasonParts.push("note: under 12 pcs — confirm decoration minimums");
  }

  return {
    recommendedRoute,
    productionType,
    reason: reasonParts.join(" · "),
    marginInHouse: round4(marginInHouse),
    marginVendor: round4(marginVendor),
  };
}

/**
 * @param {number} x
 * @returns {number}
 */
function round4(x) {
  return Math.round(x * 10000) / 10000;
}

module.exports = {
  computeRoutingDecision,
  isRushDeadline,
  marginRatio,
};
