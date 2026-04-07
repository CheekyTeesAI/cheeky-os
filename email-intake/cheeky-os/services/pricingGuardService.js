/**
 * Bundle 36 — margin / pricing guard (pure logic, no DB / no AI).
 */

const MARGIN_CLEAR = 45;
const MARGIN_REVIEW_FLOOR = 35;

/**
 * @param {unknown} input
 * @returns {{
 *   customerName?: string,
 *   quantity?: number,
 *   productType?: string,
 *   printType?: string,
 *   sellPrice?: number,
 *   estimatedCost?: unknown,
 *   paymentStatus?: string,
 *   notes?: string,
 * }}
 */
function normalizeInput(input) {
  const o = input && typeof input === "object" ? input : {};
  return {
    customerName: String(o.customerName != null ? o.customerName : "").trim(),
    quantity: Math.max(0, Math.floor(Number(o.quantity) || 0)),
    productType: String(o.productType != null ? o.productType : "").trim(),
    printType: String(o.printType != null ? o.printType : "").trim(),
    sellPrice: Number(o.sellPrice),
    estimatedCostRaw: o.estimatedCost,
    paymentStatus: String(o.paymentStatus != null ? o.paymentStatus : "").trim(),
    notes: String(o.notes != null ? o.notes : "").trim(),
  };
}

/**
 * @param {{ paymentStatus?: string, notes?: string }} o
 * @param {string[]} flags
 */
function maybeCashExceptionCandidate(o, flags) {
  const blob = `${o.paymentStatus || ""} ${o.notes || ""}`.toLowerCase();
  const hints = [
    "prepaid",
    "pre-paid",
    "cash",
    "deposit",
    "deposit paid",
    "paid in full",
    "paid in-full",
    "zelle",
    "venmo",
    "wire",
    "money order",
    "m.o.",
    "cod",
    "c.o.d.",
  ];
  for (const h of hints) {
    if (h && blob.includes(h)) {
      flags.push("cash_exception_candidate");
      return;
    }
  }
}

/**
 * @param {unknown} input
 * @returns {{
 *   marginPercent: number,
 *   passesMarginRule: boolean,
 *   pricingStatus: "clear" | "review" | "blocked",
 *   reason: string,
 *   flags: string[],
 * }}
 */
function evaluatePricingGuard(input) {
  const flags = [];
  const n = normalizeInput(input);

  maybeCashExceptionCandidate(
    { paymentStatus: n.paymentStatus, notes: n.notes },
    flags
  );

  const sellPrice = n.sellPrice;
  if (!Number.isFinite(sellPrice) || sellPrice <= 0) {
    return {
      marginPercent: 0,
      passesMarginRule: false,
      pricingStatus: "blocked",
      reason: "Missing or invalid sell price",
      flags: Array.from(new Set(["missing_sell_price", ...flags])),
    };
  }

  const hasCost =
    n.estimatedCostRaw != null && String(n.estimatedCostRaw).trim() !== "";
  const estimatedCost = hasCost ? Number(n.estimatedCostRaw) : NaN;

  if (!hasCost || !Number.isFinite(estimatedCost)) {
    const merged = Array.from(
      new Set(["missing_cost_basis", ...flags])
    );
    return {
      marginPercent: 0,
      passesMarginRule: false,
      pricingStatus: "review",
      reason: "Missing cost basis for margin evaluation",
      flags: merged,
    };
  }

  if (estimatedCost < 0) {
    return {
      marginPercent: 0,
      passesMarginRule: false,
      pricingStatus: "blocked",
      reason: "Invalid estimated cost",
      flags,
    };
  }

  const marginPercent =
    Math.round((((sellPrice - estimatedCost) / sellPrice) * 100) * 100) / 100;

  if (marginPercent >= MARGIN_CLEAR) {
    return {
      marginPercent,
      passesMarginRule: true,
      pricingStatus: "clear",
      reason: "",
      flags,
    };
  }

  flags.push("below_margin_target");

  if (marginPercent >= MARGIN_REVIEW_FLOOR && marginPercent < MARGIN_CLEAR) {
    return {
      marginPercent,
      passesMarginRule: false,
      pricingStatus: "review",
      reason: "Below default margin threshold",
      flags: Array.from(new Set(flags)),
    };
  }

  return {
    marginPercent,
    passesMarginRule: false,
    pricingStatus: "blocked",
    reason: "Margin too low",
    flags: Array.from(new Set(flags)),
  };
}

module.exports = {
  evaluatePricingGuard,
  MARGIN_CLEAR,
  MARGIN_REVIEW_FLOOR,
};
