"use strict";

const path = require("path");
const {
  effectiveTotal,
  depositCollected,
} = require("./cashRiskEngine.service");

const MS_HOUR = 3600000;
const MS_DAY = 86400000;
const HIGH_VALUE_USD = Number(process.env.CHEEKY_SALES_HIGH_VALUE_USD || 300);
const BULK_QUANTITY = Number(process.env.CHEEKY_SALES_BULK_QTY || 24);
const DORMANT_DAYS = Number(process.env.CHEEKY_SALES_DORMANT_DAYS || 90);
const REVENUE_TARGET_DEFAULT = Number(process.env.CHEEKY_DAILY_REVENUE_TARGET || 5000);

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function normEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

/** @param {{ total?: number } } quote @param {object} order */
function quoteAmount(quote, order) {
  const t = Number(quote.total);
  if (t > 0) return t;
  return effectiveTotal(order);
}

/**
 * When the quote was treated as “sent” to the customer (best available signal).
 * @param {{ status?: string, createdAt?: Date, updatedAt?: Date }} quote
 * @param {object} order
 */
function quoteSentAtMs(quote, order) {
  const inv = order.squareInvoiceSentAt ? new Date(order.squareInvoiceSentAt).getTime() : 0;
  const qst = String(quote.status || "").toUpperCase();
  const qUp = quote.updatedAt ? new Date(quote.updatedAt).getTime() : 0;
  const qCr = quote.createdAt ? new Date(quote.createdAt).getTime() : 0;
  if (inv > 0) return inv;
  if (["SENT", "OPEN", "PENDING"].includes(qst)) return Math.max(qUp, qCr);
  return qCr;
}

/** @param {object} order */
function orderQuantity(order) {
  const q = Number(order.quantity);
  if (q > 0) return q;
  return 0;
}

/**
 * @param {Map<string, { count: number, lastMs: number, name: string, paidSum: number }>} agg
 * @param {object} order
 */
function bumpCustomerAgg(agg, order) {
  const k = normEmail(order.email);
  if (!k) return;
  const cur = agg.get(k) || {
    count: 0,
    lastMs: 0,
    name: order.customerName || "",
    paidSum: 0,
  };
  cur.count += 1;
  cur.lastMs = Math.max(cur.lastMs, new Date(order.updatedAt || order.createdAt).getTime());
  cur.name = cur.name || order.customerName || "";
  cur.paidSum += Number(order.amountPaid || 0);
  agg.set(k, cur);
}

/**
 * @param {object[]} orders
 */
function buildCustomerAgg(orders) {
  /** @type {Map<string, { count: number, lastMs: number, name: string, paidSum: number }>} */
  const agg = new Map();
  for (const o of orders) {
    if (o.deletedAt) continue;
    bumpCustomerAgg(agg, o);
  }
  return agg;
}

function isRepeat(agg, order) {
  const k = normEmail(order.email);
  if (!k) return false;
  const r = agg.get(k);
  return !!(r && r.count > 1);
}

function isBulk(order, quoteTotal) {
  if (orderQuantity(order) >= BULK_QUANTITY) return true;
  if (quoteTotal >= HIGH_VALUE_USD * 3) return true;
  return false;
}

/**
 * @returns {Promise<{ orders: object[], customerAgg: Map }>}
 */
async function loadOrdersForSales() {
  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    return { orders: [], customerAgg: new Map() };
  }
  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    include: { quotes: true, customer: true },
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });
  const customerAgg = buildCustomerAgg(orders);
  return { orders, customerAgg };
}

function pipelineQuoteRow(quote, order, extra = {}) {
  const total = quoteAmount(quote, order);
  const sentMs = quoteSentAtMs(quote, order);
  return {
    quoteId: quote.id,
    orderId: order.id,
    customer: order.customerName || "",
    email: order.email || "",
    status: quote.status,
    totalUsd: Math.round(total * 100) / 100,
    hoursSinceSent: Math.max(0, Math.floor((Date.now() - sentMs) / MS_HOUR)),
    ...extra,
  };
}

/**
 * @param {{ orders: object[], customerAgg: Map }} [loaded]
 */
async function buildSalesPipelinePayload(loaded = null) {
  const { orders, customerAgg } = loaded || (await loadOrdersForSales());
  const now = Date.now();

  const quotesNew = [];
  const quotesAwaiting = [];
  const quotesFollowup = [];
  const quotesHighValue = [];

  const repeatCustomers = [];
  const highValueCustomers = [];
  const dormantCustomers = [];

  const quickWins = [];
  const bulkOpportunities = [];
  const rushOpportunities = [];

  for (const order of orders) {
    if (order.deletedAt) continue;
    const st = String(order.status || "").toUpperCase();
    if (st === "CANCELLED") continue;
    const hasMoney = depositCollected(order);
    const rush = order.isRush === true;
    if (rush && !hasMoney) {
      rushOpportunities.push({
        orderId: order.id,
        customer: order.customerName || "",
        totalUsd: Math.round(effectiveTotal(order) * 100) / 100,
        reason: "Rush flag — convert quickly",
      });
    }

    for (const quote of order.quotes || []) {
      const qst = String(quote.status || "").toUpperCase();
      const total = quoteAmount(quote, order);
      const sentMs = quoteSentAtMs(quote, order);
      const hours = Math.max(0, Math.floor((now - sentMs) / MS_HOUR));
      const ageMs = now - (quote.createdAt ? new Date(quote.createdAt).getTime() : sentMs);

      if (total >= HIGH_VALUE_USD) {
        quotesHighValue.push(pipelineQuoteRow(quote, order, { priority: "HIGH_VALUE" }));
      }

      if (["DRAFT", "PENDING"].includes(qst) && !hasMoney && ageMs < MS_DAY) {
        quotesNew.push(pipelineQuoteRow(quote, order, { bucket: "new" }));
      }

      if (!hasMoney && ["SENT", "OPEN", "PENDING", "DRAFT"].includes(qst)) {
        if (hours < 24 && (qst === "SENT" || qst === "OPEN" || order.squareInvoiceSentAt)) {
          quotesAwaiting.push(pipelineQuoteRow(quote, order, { bucket: "awaiting" }));
        } else if (hours >= 24) {
          quotesFollowup.push(pipelineQuoteRow(quote, order, { bucket: "followup" }));
        }
      }

      if (!hasMoney && isBulk(order, total)) {
        bulkOpportunities.push(
          pipelineQuoteRow(quote, order, {
            quantity: orderQuantity(order),
            reason: "Bulk or large dollar — prioritize deposit conversation",
          })
        );
      }

      if (!hasMoney && total > 0 && total < HIGH_VALUE_USD && hours >= 24 && hours < 72) {
        quickWins.push(
          pipelineQuoteRow(quote, order, {
            reason: "Smaller quote — often fast yes with a nudge",
          })
        );
      }
    }
  }

  for (const [email, row] of customerAgg.entries()) {
    if (row.count >= 2) {
      repeatCustomers.push({
        email,
        customerName: row.name,
        orderCount: row.count,
        lifetimePaidUsd: Math.round(row.paidSum * 100) / 100,
      });
    }
    if (row.paidSum >= 5000 || row.count >= 4) {
      highValueCustomers.push({
        email,
        customerName: row.name,
        orderCount: row.count,
        lifetimePaidUsd: Math.round(row.paidSum * 100) / 100,
      });
    }
    if (row.count >= 1 && now - row.lastMs > DORMANT_DAYS * MS_DAY) {
      dormantCustomers.push({
        email,
        customerName: row.name,
        lastActivityDays: Math.floor((now - row.lastMs) / MS_DAY),
      });
    }
  }

  function dedupeQuotes(arr) {
    const seen = new Set();
    const out = [];
    for (const r of arr) {
      const k = `${r.quoteId}:${r.orderId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(r);
    }
    return out;
  }

  return {
    quotes: {
      new: dedupeQuotes(quotesNew).slice(0, 80),
      awaitingResponse: dedupeQuotes(quotesAwaiting).slice(0, 80),
      followupNeeded: dedupeQuotes(quotesFollowup).slice(0, 80),
      highValue: dedupeQuotes(quotesHighValue).slice(0, 80),
    },
    customers: {
      repeatCustomers: repeatCustomers.slice(0, 60),
      highValueCustomers: highValueCustomers.slice(0, 40),
      dormantCustomers: dormantCustomers.slice(0, 60),
    },
    opportunities: {
      quickWins: dedupeQuotes(quickWins).slice(0, 40),
      bulkOpportunities: dedupeQuotes(bulkOpportunities).slice(0, 40),
      rushOpportunities: rushOpportunities.slice(0, 30),
    },
  };
}

/**
 * @param {{ orders?: object[], customerAgg?: Map } | null} preloaded
 */
async function getFollowups(preloaded = null) {
  const orders = preloaded && preloaded.orders
    ? preloaded.orders
    : (await loadOrdersForSales()).orders;
  const customerAgg = preloaded && preloaded.customerAgg
    ? preloaded.customerAgg
    : buildCustomerAgg(orders);

  const followups = [];
  const now = Date.now();

  for (const order of orders) {
    if (order.deletedAt) continue;
    if (depositCollected(order)) continue;
    const st = String(order.status || "").toUpperCase();
    if (["CANCELLED", "COMPLETED", "PAID_IN_FULL"].includes(st)) continue;

    for (const quote of order.quotes || []) {
      const qst = String(quote.status || "").toUpperCase();
      const sentSignals =
        ["SENT", "OPEN", "PENDING"].includes(qst) ||
        (qst === "DRAFT" && !!order.squareInvoiceSentAt);
      if (!sentSignals) continue;

      const sentMs = quoteSentAtMs(quote, order);
      const hours = Math.max(0, Math.floor((now - sentMs) / MS_HOUR));
      if (hours < 24) continue;

      const total = quoteAmount(quote, order);
      const repeat = isRepeat(customerAgg, order);
      const bulk = isBulk(order, total);

      let urgency = "MEDIUM";
      let reason = "Quote sent over 24h ago — check in";
      if (hours >= 72) {
        urgency = "URGENT";
        reason = "Quote sent over 72h ago — urgent follow-up";
      } else {
        urgency = "HIGH";
      }

      if (total >= HIGH_VALUE_USD) {
        urgency = hours >= 48 ? "URGENT" : "HIGH";
        reason = `High-value quote ($${Math.round(total)}) — priority follow-up`;
      }
      if (repeat) {
        reason += " | repeat customer — priority boost";
      }
      if (bulk) {
        if (urgency !== "URGENT") urgency = "HIGH";
        reason += " | bulk / large line — priority boost";
      }

      followups.push({
        type: "QUOTE_FOLLOWUP",
        urgency,
        customer: order.customerName || "",
        orderId: order.id,
        reason,
        recommendedAction: "Draft a short follow-up; confirm timing or questions before deposit",
      });
    }
  }

  function rank(a) {
    const u = a.urgency === "URGENT" ? 4 : a.urgency === "HIGH" ? 3 : a.urgency === "MEDIUM" ? 2 : 1;
    return u * 1000 + (a.customer ? 1 : 0);
  }
  followups.sort((a, b) => rank(b) - rank(a));

  return { followups: followups.slice(0, 100) };
}

/**
 * @param {{ orders?: object[], customerAgg?: Map } | null} preloaded
 */
async function buildDailySalesToday(preloaded = null) {
  const loaded =
    preloaded && preloaded.orders
      ? {
          orders: preloaded.orders,
          customerAgg: preloaded.customerAgg || buildCustomerAgg(preloaded.orders),
        }
      : await loadOrdersForSales();

  const pipeline = await buildSalesPipelinePayload(loaded);
  const { followups } = await getFollowups(loaded);
  const { orders } = loaded;

  let pipelineValue = 0;
  for (const order of orders) {
    if (order.deletedAt) continue;
    if (depositCollected(order)) continue;
    pipelineValue += effectiveTotal(order);
  }
  pipelineValue = Math.round(pipelineValue * 100) / 100;

  const likelyToClose = Math.round(
    (pipeline.quotes.highValue.reduce((s, q) => s + (q.totalUsd || 0), 0) * 0.35 +
      pipeline.opportunities.quickWins.reduce((s, q) => s + (q.totalUsd || 0), 0) * 0.25) *
      100
  ) / 100;

  const topActions = [];
  let p = 1;
  for (const f of followups.slice(0, 5)) {
    topActions.push({
      priority: p++,
      action: `Follow up ${f.customer} — ${f.reason.split("—")[0].trim()}`,
      expectedImpact: "Moves quote toward deposit; feeds cash loop",
    });
  }
  if (!topActions.length) {
    topActions.push({
      priority: 1,
      action: "Review open pipeline in /api/sales/pipeline",
      expectedImpact: "Surfaces next revenue moves",
    });
  }

  return {
    revenueTarget: REVENUE_TARGET_DEFAULT,
    pipelineValue,
    likelyToClose,
    followupsRequired: followups.length,
    topActions: topActions.slice(0, 8),
  };
}

async function buildOperatorSalesBrief() {
  const loaded = await loadOrdersForSales();
  const pipeline = await buildSalesPipelinePayload(loaded);
  const { followups } = await getFollowups(loaded);

  const dealsToClose = [
    ...pipeline.quotes.highValue.slice(0, 5).map((q) => ({
      quoteId: q.quoteId,
      orderId: q.orderId,
      customer: q.customer,
      totalUsd: q.totalUsd,
      hoursSinceSent: q.hoursSinceSent,
    })),
  ];

  return {
    dealsToClose,
    followups: followups.slice(0, 12).map((f) => ({
      type: f.type,
      urgency: f.urgency,
      customer: f.customer,
      orderId: f.orderId,
      reason: f.reason,
      recommendedAction: f.recommendedAction,
    })),
    revenueOpportunities: [
      ...pipeline.opportunities.quickWins.slice(0, 5),
      ...pipeline.opportunities.bulkOpportunities.slice(0, 5),
    ],
  };
}

module.exports = {
  buildSalesPipelinePayload,
  getFollowups,
  buildDailySalesToday,
  buildOperatorSalesBrief,
  loadOrdersForSales,
  quoteAmount,
  quoteSentAtMs,
  HIGH_VALUE_USD,
  BULK_QUANTITY,
};
