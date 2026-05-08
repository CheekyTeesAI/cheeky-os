"use strict";

const path = require("path");
const { effectiveTotal } = require("./cashRiskEngine.service");

const DEFAULT_BLANK = Number(process.env.CHEEKY_PROFIT_BLANK_COST || 4.5);
const DEFAULT_LABOR_PER_UNIT = Number(process.env.CHEEKY_PROFIT_LABOR_PER_UNIT || 2.5);
const DEFAULT_OVERHEAD_PCT = Number(process.env.CHEEKY_PROFIT_OVERHEAD_PCT || 12);
const BULK_REVENUE_USD = Number(process.env.CHEEKY_PROFIT_BULK_THRESHOLD || 2000);
const BULK_QTY_HINT = Number(process.env.CHEEKY_PROFIT_BULK_QTY || 144);
const SMALL_QTY_MAX = 12;
const SMALL_REVENUE_MAX = 600;
const MARGIN_DEFAULT_MIN = 45;
const MARGIN_BULK_MIN = 20;
const MARGIN_SMALL_TARGET = 52;
const MARGIN_STANDARD_TARGET = 45;
const MARGIN_BULK_TARGET = 28;
const MARGIN_RUSH_TARGET = 48;

/** $ per unit by print family */
const PRINT_UNIT = {
  DTG: Number(process.env.CHEEKY_PRINT_COST_DTG || 3.2),
  DTF: Number(process.env.CHEEKY_PRINT_COST_DTF || 3.5),
  SCREEN: Number(process.env.CHEEKY_PRINT_COST_SCREEN || 2.8),
};

function normPrintMethod(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (s.includes("SCREEN") || s === "SILKSCREEN") return "SCREEN";
  if (s.includes("DTF")) return "DTF";
  return "DTG";
}

/**
 * @param {object} orderIntent
 */
function calculateCost(orderIntent) {
  const o = orderIntent && typeof orderIntent === "object" ? orderIntent : {};
  const qty = Math.max(1, Math.floor(Number(o.quantity) || 1));
  const method = normPrintMethod(o.printMethod || o.printType);
  const printEach = PRINT_UNIT[method] || PRINT_UNIT.DTG;
  const blankEach =
    Number(o.blankCostPerUnit) > 0 ? Number(o.blankCostPerUnit) : DEFAULT_BLANK;
  const laborEach =
    Number(o.laborPerUnit) > 0 ? Number(o.laborPerUnit) : DEFAULT_LABOR_PER_UNIT;

  const blankGarmentCost = Math.round(qty * blankEach * 100) / 100;
  const printCost = Math.round(qty * printEach * 100) / 100;
  const laborEstimate = Math.round(qty * laborEach * 100) / 100;
  const subtotal = blankGarmentCost + printCost + laborEstimate;
  const overheadPct =
    Number(o.overheadPercent) >= 0 ? Number(o.overheadPercent) : DEFAULT_OVERHEAD_PCT;
  const overheadAllocation = Math.round(subtotal * (overheadPct / 100) * 100) / 100;
  const totalCost = Math.round((subtotal + overheadAllocation) * 100) / 100;

  return {
    blankGarmentCost,
    printCost,
    laborEstimate,
    overheadAllocation,
    totalCost,
    quantity: qty,
    printMethod: method,
  };
}

/**
 * @param {number} cost
 * @param {number} price
 */
function calculateMargin(cost, price) {
  const c = Number(cost) || 0;
  const p = Number(price) || 0;
  const profit = Math.round((p - c) * 100) / 100;
  const marginPercent = p > 1e-6 ? Math.round(((profit / p) * 100) * 100) / 100 : 0;
  return {
    cost: Math.round(c * 100) / 100,
    price: Math.round(p * 100) / 100,
    profit,
    marginPercent,
  };
}

/**
 * @param {object} orderIntent
 */
function classifyDeal(orderIntent) {
  const o = orderIntent && typeof orderIntent === "object" ? orderIntent : {};
  const qty = Math.max(1, Math.floor(Number(o.quantity) || 1));
  const sell =
    Number(o.targetSellPrice ?? o.sellPrice ?? o.quoteTotal ?? 0) || 0;
  const refRev = sell > 0 ? sell : 0;
  const isBulk = refRev >= BULK_REVENUE_USD || qty >= BULK_QTY_HINT;
  const isSmall =
    qty <= SMALL_QTY_MAX && (refRev === 0 || refRev < SMALL_REVENUE_MAX);
  const rush = o.rush === true || o.isRush === true;
  return { isBulk, isSmall, rush, qty, refRev };
}

/**
 * @param {object} orderIntent
 */
function minimumMarginPercent(orderIntent) {
  const { isBulk } = classifyDeal(orderIntent);
  return isBulk ? MARGIN_BULK_MIN : MARGIN_DEFAULT_MIN;
}

/**
 * Target margin for recommended price (before rush multiplier).
 * @param {object} orderIntent
 */
function targetMarginPercent(orderIntent) {
  const { isBulk, isSmall, rush } = classifyDeal(orderIntent);
  if (rush) return MARGIN_RUSH_TARGET;
  if (isBulk) return MARGIN_BULK_TARGET;
  if (isSmall) return MARGIN_SMALL_TARGET;
  return MARGIN_STANDARD_TARGET;
}

/**
 * Core profit decision — decision support only (no persistence).
 * @param {object} orderIntent
 */
function evaluateDeal(orderIntent) {
  const o = orderIntent && typeof orderIntent === "object" ? orderIntent : {};
  const rawEst = o.estimatedCost ?? o.estimatedCostRaw;
  if (
    rawEst != null &&
    String(rawEst).trim() !== "" &&
    Number.isFinite(Number(rawEst)) &&
    Number(rawEst) >= 0
  ) {
    const est = Number(rawEst);
    const modeled = calculateCost(o).totalCost;
    const costBasis = Math.max(est, modeled * 0.85);
    const fixed = evaluateDealWithFixedCost(o, costBasis);
    return {
      ...fixed,
      costBreakdown: {
        ...calculateCost(o),
        estimatedCostProvided: est,
        costBasisUsed: costBasis,
      },
    };
  }

  const costBreakdown = calculateCost(orderIntent);
  const cost = costBreakdown.totalCost;
  const minPct = minimumMarginPercent(orderIntent);
  const tgtPct = targetMarginPercent(orderIntent);

  const minDecimal = minPct / 100;
  const tgtDecimal = tgtPct / 100;
  let minimumSafePrice = minDecimal >= 1 ? cost : Math.round((cost / (1 - minDecimal)) * 100) / 100;
  let recommendedPrice =
    tgtDecimal >= 1 ? cost : Math.round((cost / (1 - tgtDecimal)) * 100) / 100;

  const { rush } = classifyDeal(orderIntent);
  if (rush) {
    recommendedPrice = Math.round(recommendedPrice * 1.08 * 100) / 100;
    minimumSafePrice = Math.round(minimumSafePrice * 1.05 * 100) / 100;
  }

  const marginAtMinimum = calculateMargin(cost, minimumSafePrice).marginPercent;
  const marginAtRecommended = calculateMargin(cost, recommendedPrice).marginPercent;

  const sell = Number(
    orderIntent &&
      (orderIntent.targetSellPrice ?? orderIntent.sellPrice ?? orderIntent.quoteTotal)
  );
  let riskLevel = "SAFE";
  let recommendation =
    "Price at or above recommended to protect target margin; confirm with margin rules before quote send.";

  if (Number.isFinite(sell) && sell > 0) {
    const mSell = calculateMargin(cost, sell);
    if (sell + 1e-6 < minimumSafePrice) {
      riskLevel = "DANGEROUS";
      recommendation = `Quoted/jobs price ($${sell.toFixed(
        2
      )}) is below minimum safe ($${minimumSafePrice.toFixed(
        2
      )}) for ${minPct}% floor — raise price, reduce scope, or approved exception.`;
    } else if (mSell.marginPercent + 0.5 < minPct) {
      riskLevel = "DANGEROUS";
      recommendation = `Margin at offered price (${mSell.marginPercent.toFixed(
        1
      )}%) is under the ${minPct}% rule — do not send without fix or approval.`;
    } else if (mSell.marginPercent + 0.5 < MARGIN_DEFAULT_MIN && !classifyDeal(orderIntent).isBulk) {
      riskLevel = "LOW_MARGIN";
      recommendation =
        "Thin vs default Cheeky target — okay only if deliberate; consider upsell or tighter cost.";
    } else if (mSell.marginPercent + 1 < tgtPct) {
      riskLevel = "LOW_MARGIN";
      recommendation =
        "Below ideal target for this deal shape — still above floor if above safe price.";
    }
  } else {
    if (marginAtRecommended + 0.5 < minPct) {
      riskLevel = "LOW_MARGIN";
      recommendation = "Model suggests margin pressure — verify costs and quantity before quoting.";
    }
  }

  return {
    recommendedPrice,
    minimumSafePrice,
    marginAtRecommended,
    marginAtMinimum,
    riskLevel,
    recommendation,
    costBreakdown,
    rulesApplied: {
      minimumMarginPercent: minPct,
      targetMarginPercent: tgtPct,
      bulkThresholdUsd: BULK_REVENUE_USD,
    },
  };
}

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function orderToIntent(order) {
  const total = effectiveTotal(order);
  return {
    quantity: Math.max(1, Number(order.quantity) || 1),
    printMethod: order.printMethod || order.productionTypeFinal || "DTG",
    rush: order.isRush === true,
    targetSellPrice: total > 0 ? total : Number(order.quotedAmount) || 0,
    estimatedCostRaw: order.estimatedCost ?? order.costEstimate,
    customerName: order.customerName,
  };
}

/**
 * @param {object} intent
 * @param {number} fixedCost
 */
function evaluateDealWithFixedCost(intent, fixedCost) {
  const minPct = minimumMarginPercent(intent);
  const tgtPct = targetMarginPercent(intent);
  const { rush } = classifyDeal(intent);
  const minDecimal = minPct / 100;
  const tgtDecimal = tgtPct / 100;
  const cost = Math.round(Number(fixedCost) * 100) / 100;
  let minimumSafePrice = Math.round((cost / (1 - minDecimal)) * 100) / 100;
  let recommendedPrice = Math.round((cost / (1 - tgtDecimal)) * 100) / 100;
  if (rush) {
    recommendedPrice = Math.round(recommendedPrice * 1.08 * 100) / 100;
    minimumSafePrice = Math.round(minimumSafePrice * 1.05 * 100) / 100;
  }
  const marginAtMinimum = calculateMargin(cost, minimumSafePrice).marginPercent;
  const marginAtRecommended = calculateMargin(cost, recommendedPrice).marginPercent;
  const sell = Number(intent.targetSellPrice ?? intent.sellPrice ?? intent.quoteTotal ?? 0);
  let riskLevel = "SAFE";
  let recommendation =
    "Price at or above recommended to protect target margin; confirm before quote send.";

  if (Number.isFinite(sell) && sell > 0) {
    const mSell = calculateMargin(cost, sell);
    if (sell + 1e-6 < minimumSafePrice) {
      riskLevel = "DANGEROUS";
      recommendation = `Price below minimum safe ($${minimumSafePrice.toFixed(2)}) — raise or re-scope.`;
    } else if (mSell.marginPercent + 0.5 < minPct) {
      riskLevel = "DANGEROUS";
      recommendation = `Margin ${mSell.marginPercent.toFixed(1)}% under ${minPct}% floor.`;
    } else if (mSell.marginPercent + 0.5 < MARGIN_DEFAULT_MIN && !classifyDeal(intent).isBulk) {
      riskLevel = "LOW_MARGIN";
      recommendation = "Thin vs default margin target for non-bulk — review.";
    }
  }

  return {
    recommendedPrice,
    minimumSafePrice,
    marginAtRecommended,
    marginAtMinimum,
    riskLevel,
    recommendation,
    rulesApplied: {
      minimumMarginPercent: minPct,
      targetMarginPercent: tgtPct,
      bulkThresholdUsd: BULK_REVENUE_USD,
    },
  };
}

/**
 * @param {object} order
 */
function evaluateOrderRow(order) {
  const intent = orderToIntent(order);
  const hasEst =
    intent.estimatedCostRaw != null &&
    String(intent.estimatedCostRaw).trim() !== "" &&
    Number.isFinite(Number(intent.estimatedCostRaw)) &&
    Number(intent.estimatedCostRaw) >= 0;

  if (hasEst) {
    const est = Number(intent.estimatedCostRaw);
    const modeled = calculateCost(intent).totalCost;
    const costBasis = Math.max(est, modeled * 0.85);
    const ev = evaluateDealWithFixedCost(intent, costBasis);
    return {
      orderId: order.id,
      customerName: order.customerName || "",
      ...ev,
      costBreakdown: {
        ...calculateCost(intent),
        estimatedCostFromOrder: est,
        costBasisUsed: costBasis,
      },
    };
  }

  const ev = evaluateDeal(intent);
  return {
    orderId: order.id,
    customerName: order.customerName || "",
    ...ev,
  };
}

/**
 * Snapshot for operator cycle — read-only, newest orders first.
 */
async function buildOperatorPricingBlock() {
  const prisma = getPrisma();
  const empty = {
    dealsEvaluated: [],
    riskyDeals: [],
    priceAdjustments: [],
  };
  if (!prisma || !prisma.order) return empty;

  let orders = [];
  try {
    orders = await prisma.order.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 35,
    });
  } catch (_) {
    return empty;
  }

  const dealsEvaluated = [];
  const riskyDeals = [];
  const priceAdjustments = [];

  for (const order of orders) {
    const row = evaluateOrderRow(order);
    dealsEvaluated.push({
      orderId: row.orderId,
      customerName: row.customerName,
      riskLevel: row.riskLevel,
      recommendedPrice: row.recommendedPrice,
      minimumSafePrice: row.minimumSafePrice,
      marginAtRecommended: row.marginAtRecommended,
      recommendation: row.recommendation,
    });

    if (row.riskLevel === "DANGEROUS" || row.riskLevel === "LOW_MARGIN") {
      riskyDeals.push({
        orderId: row.orderId,
        customerName: row.customerName,
        riskLevel: row.riskLevel,
        recommendation: row.recommendation,
      });
    }

    const sell = Number(orderToIntent(order).targetSellPrice) || 0;
    if (sell > 0 && row.recommendedPrice > sell + 1e-2) {
      priceAdjustments.push({
        orderId: row.orderId,
        customerName: row.customerName,
        currentPrice: sell,
        suggestedMinimum: row.minimumSafePrice,
        suggestedOptimal: row.recommendedPrice,
        deltaUsd: Math.round((row.recommendedPrice - sell) * 100) / 100,
      });
    }
  }

  return {
    dealsEvaluated: dealsEvaluated.slice(0, 30),
    riskyDeals: riskyDeals.slice(0, 15),
    priceAdjustments: priceAdjustments.slice(0, 15),
  };
}

const PROFIT_ENGINE_META = {
  status: "PROFIT_ENGINE_ACTIVE",
  marginProtected: true,
  badDealsFlagged: true,
  pricingGuided: true,
  nextAction: "Run every quote through pricing engine before sending.",
};

module.exports = {
  calculateCost,
  calculateMargin,
  classifyDeal,
  minimumMarginPercent,
  targetMarginPercent,
  evaluateDeal,
  evaluateDealWithFixedCost,
  buildOperatorPricingBlock,
  orderToIntent,
  PROFIT_ENGINE_META,
  BULK_REVENUE_USD,
  MARGIN_DEFAULT_MIN,
  MARGIN_BULK_MIN,
};