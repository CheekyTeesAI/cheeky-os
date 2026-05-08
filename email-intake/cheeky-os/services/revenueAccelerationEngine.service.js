"use strict";

const {
  loadOrdersForSales,
  quoteAmount,
  HIGH_VALUE_USD,
  BULK_QUANTITY,
  getFollowups,
} = require("./salesEngineV1.service");
const { depositCollected, effectiveTotal } = require("./cashRiskEngine.service");

const PAST_LARGE_CLIENT_USD = Number(process.env.CHEEKY_PAST_LARGE_CLIENT_USD || 2500);
const PAST_LARGE_ORDER_USD = Number(process.env.CHEEKY_PAST_LARGE_ORDER_USD || 500);

const REVENUE_ACCELERATION_META = {
  status: "REVENUE_ACCELERATION_ACTIVE",
  bigDealsVisible: true,
  dealSizeIncreasing: true,
  pipelineQualityImproved: true,
  nextAction: "Focus on top 2 big deals daily before small jobs.",
};

const ORG_HINTS =
  /\b(school|district|pta|booster|athletic|team|sports?\s*club|little\s*league|university|college|chorus|band|marching|church|ministry|llc\.?|inc\.?|corp|corporation|company|fire\s*dept|police|municipal|nonprofit|fundraiser)\b/i;

function normEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function orderQuantity(order) {
  const q = Number(order.quantity);
  return q > 0 ? q : 0;
}

function isBulkOrder(order, quoteTotal) {
  if (orderQuantity(order) >= BULK_QUANTITY) return true;
  if (quoteTotal >= HIGH_VALUE_USD * 3) return true;
  return false;
}

function buildCustomerAgg(orders) {
  const agg = new Map();
  for (const o of orders) {
    if (o.deletedAt) continue;
    const k = normEmail(o.email);
    if (!k) continue;
    const cur = agg.get(k) || { count: 0, lastMs: 0, name: o.customerName || "", paidSum: 0, maxQuoteUsd: 0 };
    cur.count += 1;
    cur.lastMs = Math.max(cur.lastMs, new Date(o.updatedAt || o.createdAt).getTime());
    cur.name = cur.name || o.customerName || "";
    cur.paidSum += Number(o.amountPaid || 0);
    const et = effectiveTotal(o);
    cur.maxQuoteUsd = Math.max(cur.maxQuoteUsd, Number(o.quotedAmount || 0) || et);
    agg.set(k, cur);
  }
  return agg;
}

function isRepeat(agg, order) {
  const k = normEmail(order.email);
  if (!k) return false;
  const r = agg.get(k);
  return !!(r && r.count > 1);
}

function orgSignal(order) {
  const blob = `${order.customerName || ""} ${order.email || ""} ${order.notes || ""} ${order.source || ""}`;
  return ORG_HINTS.test(blob);
}

function isPastLargeClient(agg, order) {
  const k = normEmail(order.email);
  if (!k) return false;
  const r = agg.get(k);
  if (!r) return false;
  if (r.paidSum >= PAST_LARGE_CLIENT_USD) return true;
  if (r.maxQuoteUsd >= PAST_LARGE_ORDER_USD) return true;
  return false;
}

/**
 * @param {{ orders?: object[], customerAgg?: Map } | null} preloaded
 * @returns {Promise<Array<{ customer: object, opportunityType: string, estimatedValue: number, reason: string, orderId: string, quoteId: string }>>}
 */
async function identifyHighValueOpportunities(preloaded = null) {
  const loaded =
    preloaded && preloaded.orders
      ? {
          orders: preloaded.orders,
          customerAgg: preloaded.customerAgg || buildCustomerAgg(preloaded.orders),
        }
      : await loadOrdersForSales();

  const { orders, customerAgg } = loaded;
  const out = [];
  const seen = new Set();

  for (const order of orders) {
    if (order.deletedAt) continue;
    const st = String(order.status || "").toUpperCase();
    if (st === "CANCELLED") continue;

    const hasMoney = depositCollected(order);
    const repeat = isRepeat(customerAgg, order);
    const pastLarge = isPastLargeClient(customerAgg, order);
    const org = orgSignal(order);

    for (const quote of order.quotes || []) {
      const total = quoteAmount(quote, order);
      if (total <= 0 && !org && !pastLarge && !repeat) continue;

      const bulk = isBulkOrder(order, total);
      const highQuote = total >= HIGH_VALUE_USD;

      if (!highQuote && !bulk && !repeat && !pastLarge && !org) continue;

      const key = `${order.id}:${quote.id}`;
      if (seen.has(key)) continue;

      let opportunityType = "UPSELL";
      let reason = "";
      let estimatedValue = Math.round(total * 100) / 100;

      if (bulk) {
        opportunityType = "BULK";
        reason = `Bulk or large-dollar line (${orderQuantity(order) || "?"} pcs / $${Math.round(total)})`;
      } else if (repeat) {
        opportunityType = "REPEAT";
        const row = customerAgg.get(normEmail(order.email));
        reason = `Repeat client (${row && row.count ? row.count : "?"} orders) — expand commitment`;
      } else if (pastLarge) {
        opportunityType = "REPEAT";
        reason = "Past large spender — protect relationship with right sizing";
      }

      if (org) {
        reason = reason ? `${reason}; ` : "";
        reason += "Org / team / business signal — bundle + roster sizing";
      }

      if (highQuote && !reason.includes("maximize line items")) {
        reason = reason ? `${reason}; ` : "";
        reason += `Quote at or above $${HIGH_VALUE_USD} — maximize line items`;
      }

      if (!reason) reason = "High-value pipeline signal — qualify and expand";

      if (!hasMoney) {
        estimatedValue = Math.max(estimatedValue, Math.round(total * 100) / 100);
      } else {
        estimatedValue = Math.round(Math.max(estimatedValue, effectiveTotal(order)) * 1.15 * 100) / 100;
      }

      seen.add(key);
      out.push({
        customer: {
          name: order.customerName || "",
          email: order.email || "",
        },
        opportunityType,
        estimatedValue,
        reason: reason.trim(),
        orderId: order.id,
        quoteId: quote.id,
      });
    }
  }

  out.sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0));
  return out;
}

/**
 * @param {object} opportunity — row from identifyHighValueOpportunities (+ optional loaded order)
 */
function structureDeal(opportunity) {
  const t = Number(opportunity.estimatedValue || 0);
  const type = opportunity.opportunityType || "UPSELL";
  let recommendedQuantity = Math.max(24, BULK_QUANTITY);
  if (type === "BULK") recommendedQuantity = Math.max(orderQuantity(opportunity._order || {}) || 0, BULK_QUANTITY, 36);
  if (type === "REPEAT") recommendedQuantity = Math.max(12, BULK_QUANTITY / 2);
  if (type === "UPSELL") recommendedQuantity = Math.max(12, Math.min(48, Math.ceil(t / 25)));

  let pricingStrategy = "Tiered volume — show 24 / 48 / 72 qty breaks";
  if (type === "REPEAT") pricingStrategy = "Loyalty bump — slight break on second line + deposit lock";
  if (type === "UPSELL") pricingStrategy = "Anchor high-GMS items first; attach lower-cost add-ons";

  const upsellOptions = [
    { skuHint: "Back print add-on", marginNote: "+15–25% effective margin when bundled" },
    { skuHint: "Premium garment tier upgrade", marginNote: "Higher ticket with modest cost delta" },
    { skuHint: "Rush / deadline lane", marginNote: "Explicit fee; protects schedule" },
  ];

  const bundleIdeas = [
    "Hoodies + tees same art — shared setup",
    "Hats + tees event pack",
    "Parent + player twin packs for schools/teams",
  ];

  const marginTarget = type === "BULK" ? 0.38 : type === "REPEAT" ? 0.34 : 0.32;

  return {
    recommendedQuantity,
    pricingStrategy,
    upsellOptions,
    bundleIdeas,
    marginTarget,
  };
}

/**
 * @param {{ quantity?: number, garmentType?: string, totalUsd?: number, customerSegment?: string, hasBackPrint?: boolean }} orderIntent
 */
function optimizeQuote(orderIntent) {
  const q = Number(orderIntent.quantity || 0);
  const total = Number(orderIntent.totalUsd || 0);
  const garment = String(orderIntent.garmentType || "tee").toLowerCase();
  const back = orderIntent.hasBackPrint === true;
  const suggestions = [];

  const backAdd = Math.max(4, Math.min(12, Math.round((total / Math.max(q, 1)) * 0.35)));
  if (!back) {
    suggestions.push({
      line: `Add back print for +$${backAdd}/ea (indicative)`,
      goal: "Lift ticket without new SKU run",
    });
  }
  suggestions.push({
    line: garment.includes("hood")
      ? "Offer matched tee qty at hoodie's secondary price tier"
      : "Upgrade to premium fleece / heavyweight tee on top 20% of qty",
    goal: "Increase average garment revenue",
  });
  suggestions.push({
    line: "Bundle 12 extra units at next price break for roster changes",
    goal: "Reduce per-piece and increase gross",
  });

  return {
    goals: ["increase order size", "improve margin", "add upsells"],
    suggestions,
    note: "Decision support only — no auto-send; validate pricing in house.",
  };
}

/**
 * @param {object} opportunity
 */
function generateCloseStrategy(opportunity) {
  const type = opportunity.opportunityType || "UPSELL";
  const name = (opportunity.customer && opportunity.customer.name) || "there";

  const angles = {
    BULK: `Lead with production calendar + deposit lock — ${name}'s volume earns priority dates.`,
    REPEAT: `Thank them for coming back; bridge from last order quality to this scope.`,
    UPSELL: `Confirm art + garment line-up; offer one bundled upgrade that simplifies their buy.`,
  };

  return {
    messageAngle: angles[type] || angles.UPSELL,
    urgency:
      type === "BULK"
        ? "HIGH — large runs tie floor space"
        : type === "REPEAT"
          ? "MEDIUM — relationship window"
          : "MEDIUM — quote freshness",
    offer: "Deposit to hold schedule + optional 3–5% prepay courtesy on full prepayment (if policy allows)",
    followupPlan: "Day 0 confirm questions · Day 2 value recap + bundle option · Day 4 phone/text for decision",
  };
}

/**
 * @param {{ orders?: object[], customerAgg?: Map } | null} preloaded
 */
async function buildBigDealsPayload(preloaded = null) {
  const loaded =
    preloaded && preloaded.orders
      ? {
          orders: preloaded.orders,
          customerAgg: preloaded.customerAgg || buildCustomerAgg(preloaded.orders),
        }
      : await loadOrdersForSales();

  const opportunities = await identifyHighValueOpportunities(loaded);
  const orderById = new Map(loaded.orders.map((o) => [o.id, o]));

  const topDeals = opportunities.slice(0, 20).map((opp) => {
    const ord = orderById.get(opp.orderId);
    const enriched = { ...opp, _order: ord };
    const dealStructure = structureDeal(enriched);
    const closeStrategy = generateCloseStrategy(opp);
    const quote = ord && ord.quotes ? ord.quotes.find((q) => q.id === opp.quoteId) : null;
    const totalUsd = quote && ord ? quoteAmount(quote, ord) : opp.estimatedValue;
    const quoteOptimization = optimizeQuote({
      quantity: ord ? orderQuantity(ord) : 0,
      garmentType: ord && ord.garmentType,
      totalUsd,
      hasBackPrint: !!(ord && ord.notes && /\bback\b/i.test(ord.notes)),
    });

    const { _order, ...safeOpp } = enriched;
    return {
      ...safeOpp,
      dealStructure,
      closeStrategy,
      quoteOptimization,
    };
  });

  const potentialRevenue = Math.round(
    opportunities.reduce((s, o) => s + Number(o.estimatedValue || 0), 0) * 100
  ) / 100;

  const actionsRequired = [];
  let p = 1;
  for (const d of topDeals.slice(0, 8)) {
    actionsRequired.push({
      priority: p++,
      action: `${d.opportunityType}: ${d.customer.name || d.customer.email} — ${d.reason.slice(0, 120)}`,
      orderId: d.orderId,
      quoteId: d.quoteId,
    });
  }
  if (!actionsRequired.length) {
    actionsRequired.push({
      priority: 1,
      action: "Scan /api/sales/pipeline for quotes approaching $300+ and log bulk intents.",
      orderId: null,
      quoteId: null,
    });
  }

  return {
    totalOpportunities: opportunities.length,
    topDeals,
    potentialRevenue,
    actionsRequired,
    ...REVENUE_ACCELERATION_META,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Operator-facing slice (no auto-send).
 */
async function buildBigDealsOperatorBlock(preloaded = null) {
  const loaded =
    preloaded && preloaded.orders
      ? {
          orders: preloaded.orders,
          customerAgg: preloaded.customerAgg || buildCustomerAgg(preloaded.orders),
        }
      : await loadOrdersForSales();

  const opportunities = await identifyHighValueOpportunities(loaded);
  const { followups } = await getFollowups(loaded);
  const bigOrderIds = new Set(opportunities.map((o) => o.orderId).filter(Boolean));

  const mustClose = opportunities.slice(0, 10).map((o) => ({
    customer: o.customer,
    opportunityType: o.opportunityType,
    estimatedValue: o.estimatedValue,
    reason: o.reason,
    orderId: o.orderId,
    quoteId: o.quoteId,
    closeHint: generateCloseStrategy(o).messageAngle,
  }));

  const followupsBig = followups.filter((f) => bigOrderIds.has(f.orderId));

  const estimatedRevenue = Math.round(
    opportunities.slice(0, 10).reduce((s, o) => s + Number(o.estimatedValue || 0), 0) * 100
  ) / 100;

  return {
    mustClose,
    followups: followupsBig.slice(0, 15),
    estimatedRevenue,
  };
}

module.exports = {
  identifyHighValueOpportunities,
  structureDeal,
  optimizeQuote,
  generateCloseStrategy,
  buildBigDealsPayload,
  buildBigDealsOperatorBlock,
  REVENUE_ACCELERATION_META,
};
