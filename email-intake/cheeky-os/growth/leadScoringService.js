"use strict";

/**
 * Lead scoring — heuristic, read-only. Persists cached scores for dashboard speed.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const draftHelpers = require("../drafting/draftOrderHelpers");
const taskQueue = require("../agent/taskQueue");

const SCORE_STORE = "lead-scores.json";

const CATS = [
  "Reactivation",
  "Warm repeat customer",
  "High-LTV",
  "Slow responder",
  "Fast payer",
  "School/team",
  "Corporate/trades",
  "Cold B2B",
];

function storePath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, SCORE_STORE);
}

function readStore() {
  const p = storePath();
  if (!fs.existsSync(p))
    return { generatedAt: null, leads: {}, list: [], note: null };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" ? j : { leads: {}, list: [] };
  } catch (_e) {
    return { generatedAt: null, leads: {}, list: [], note: "recoverable_parse_error" };
  }
}

function writeStore(doc) {
  const p = storePath();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function stableLeadId(seed) {
  const h = crypto.createHash("sha1").update(String(seed)).digest("hex");
  return `lead-${h.slice(0, 16)}`;
}

function detectCategories(name, notes, agg) {
  const blob = `${name || ""} ${notes || ""}`.toLowerCase();
  /** @type {string[]} */
  const out = [];
  if (/school|pta|team|athletic|wildcats|trojans|eagles|district|coach/.test(blob)) out.push("School/team");
  if (/llc|inc\.|corp|company|construction|electric|plumb|hvac|roofing/.test(blob)) out.push("Corporate/trades");

  const daysSince = agg.daysSinceLastOrder;
  if (agg.orderCount >= 2 && daysSince >= 30 && daysSince <= 540) out.push("Warm repeat customer");
  if (daysSince >= 75 && agg.totalSpend > 200 && agg.orderCount >= 1) out.push("Reactivation");
  if (agg.totalSpend >= 7500 || agg.avgOrder >= 1200) out.push("High-LTV");
  if (agg.avgDaysToFirstDeposit != null && agg.avgDaysToFirstDeposit <= 2 && agg.ordersWithDeposit >= 1) out.push("Fast payer");
  if (
    agg.avgDaysQuoteToTouch != null &&
    agg.avgDaysQuoteToTouch >= 14 &&
    agg.orderCount >= 1
  )
    out.push("Slow responder");
  if (out.indexOf("Corporate/trades") >= 0 && agg.orderCount <= 2 && agg.totalSpend < 1500 && daysSince <= 180)
    out.push("Cold B2B");

  if (!out.length) out.push("Warm repeat customer");
  return Array.from(new Set(out));
}

/**
 * Aggregate raw orders for one lead key.
 */
function aggregateOrders(rows) {
  const orderCount = rows.length;
  let totalSpend = 0;
  let amountPaidSum = 0;
  /** @type {Date|null} */
  let lastDt = null;
  /** @type {Date|null} */
  let firstDt = null;
  let deposits = 0;
  let depositDaySum = 0;
  let quoteTouchSum = 0;
  let quoteTouchN = 0;
  let completedN = 0;

  rows.forEach((o) => {
    const amt = Number(o.amountPaid != null ? o.amountPaid : 0);
    const tot = Number(
      (o.totalAmount != null ? o.totalAmount : o.total != null ? o.total : o.amountTotal) || 0
    );
    amountPaidSum += amt;
    totalSpend += Math.max(amt, tot * 0.85);

    const u = new Date(o.updatedAt || o.createdAt);
    if (!lastDt || u > lastDt) lastDt = u;
    const c = new Date(o.createdAt || o.updatedAt);
    if (!firstDt || c < firstDt) firstDt = c;

    if (o.depositPaid || o.depositPaidAt || o.depositReceived) {
      deposits += 1;
      if (o.depositPaidAt && o.createdAt) {
        const ddays = draftHelpers.daysBetween(new Date(o.createdAt), new Date(o.depositPaidAt));
        if (ddays >= 0 && ddays < 400) depositDaySum += ddays;
      }
    }

    const st = String(o.status || "").toUpperCase();
    if (st.includes("COMPLETE")) completedN += 1;

    const created = o.createdAt ? new Date(o.createdAt) : null;
    const touched = o.updatedAt ? new Date(o.updatedAt) : null;
    if (created && touched) {
      const gap = draftHelpers.daysBetween(created, touched);
      if (gap >= 0 && gap < 600) {
        quoteTouchSum += gap;
        quoteTouchN += 1;
      }
    }
  });

  const now = new Date();
  const daysSinceLastOrder = lastDt ? draftHelpers.daysBetween(lastDt, now) : 999;
  const avgOrder = orderCount ? totalSpend / orderCount : 0;
  const avgDaysToFirstDeposit = deposits ? depositDaySum / deposits : null;
  const avgDaysQuoteToTouch = quoteTouchN ? quoteTouchSum / quoteTouchN : null;
  const conversionHint = orderCount ? completedN / orderCount : 0;

  return {
    orderCount,
    totalSpend: Math.round(totalSpend * 100) / 100,
    avgOrder: Math.round(avgOrder * 100) / 100,
    lastOrderDate: lastDt ? lastDt.toISOString() : null,
    firstOrderDate: firstDt ? firstDt.toISOString() : null,
    daysSinceLastOrder,
    ordersWithDeposit: deposits,
    avgDaysToFirstDeposit,
    avgDaysQuoteToTouch,
    quoteConversionHint: Math.round(conversionHint * 100) / 100,
  };
}

/** @returns {object} */
function scoreLead(leadKey, orders, hints) {
  const name = hints && hints.customerName ? String(hints.customerName) : "";
  const email = hints && hints.email ? String(hints.email) : "";
  const agg = aggregateOrders(orders || []);
  const categories = detectCategories(name, (orders && orders[0] && orders[0].notes) || "", agg);

  let score = 40;
  const reasons = [];

  if (agg.totalSpend > 2000) {
    score += 18;
    reasons.push(`Solid lifetime value (~$${Math.round(agg.totalSpend)} tracked).`);
  } else if (agg.totalSpend > 500) {
    score += 10;
    reasons.push(`Meaningful spend history (~$${Math.round(agg.totalSpend)}).`);
  }

  if (agg.orderCount >= 3) {
    score += 12;
    reasons.push(`${agg.orderCount} orders logged — repeats matter.`);
  } else if (agg.orderCount === 2) {
    score += 6;
    reasons.push(`Second order on file — nurture for a third.`);
  }

  if (agg.avgDaysToFirstDeposit != null && agg.avgDaysToFirstDeposit <= 3) {
    score += 8;
    reasons.push("Historically pays deposits quickly — trust indicator.");
  }
  if (agg.avgDaysQuoteToTouch != null && agg.avgDaysQuoteToTouch <= 7) {
    score += 5;
    reasons.push("Responsive to quote touches — momentum friendly.");
  } else if (agg.avgDaysQuoteToTouch != null && agg.avgDaysQuoteToTouch >= 21) {
    score -= 4;
    reasons.push("Slow loop on revisions — lighten the ask.");
  }

  if (agg.daysSinceLastOrder > 365) {
    score += 14;
    reasons.push("Dormant 12m+ — reactivation lane if rapport still warm.");
  } else if (agg.daysSinceLastOrder > 90) {
    score += 8;
    reasons.push("Cooling timeline — polite check-in beats silence.");
  } else if (agg.daysSinceLastOrder < 30) {
    score += 4;
    reasons.push("Fresh activity — careful not to over-mail.");
  }

  if (agg.quoteConversionHint >= 0.55) reasons.push("Strong finish rate on tracked jobs.");

  categories.forEach((c) => {
    if (/High-LTV|Reactivation/.test(c)) score += 3;
    if (/School\/team/.test(c)) score += 2;
  });

  score = Math.max(1, Math.min(100, Math.round(score)));
  /** primary category bucket */
  const category =
    categories.find((x) => /Reactivation|High-LTV|School/.test(x)) || categories[0] || "Warm repeat customer";

  const confidence = Math.min(0.93, 0.42 + Math.min(6, agg.orderCount) * 0.08 + (email ? 0.06 : 0));

  const leadId = stableLeadId(leadKey);
  /** overdue estimate heuristic */
  const overdueEst = orders.some((o) => {
    try {
      if (!o.quoteExpiresAt) return false;
      const ex = new Date(o.quoteExpiresAt);
      const st = String(o.status || "").toUpperCase();
      return ex < new Date() && !st.includes("COMPLETE");
    } catch (_e2) {
      return false;
    }
  });

  let recommendedAction = "Warm check-in referencing last project — draft only.";
  if (categories.indexOf("Reactivation") >= 0)
    recommendedAction =
      "Reactivation pass: acknowledge time gap + single clear next step — draft outreach for Patrick approval.";
  if (overdueEst)
    recommendedAction =
      "Estimate follow-up: confirm still interested without pressure — draft for approval.";

  return {
    leadId,
    customer: name || email || leadKey.slice(0, 40),
    score,
    category,
    categories,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    recommendedAction,
    estimatedOpportunity: Math.round(Math.max(150, agg.avgOrder * 0.35 + agg.totalSpend * 0.05)),
    lastOrderDate: agg.lastOrderDate,
    lastContactDate: agg.lastOrderDate,
    generatedAt: new Date().toISOString(),
    flags: { overdueEstimate: overdueEst, orderCount: agg.orderCount, totalSpend: agg.totalSpend },
  };
}

/**
 * @returns {Promise<object[]>}
 */
async function scoreAllLeads() {
  const rows = await draftHelpers.loadOrdersForDrafts(600);
  if (!rows.length) {
    const doc = {
      generatedAt: new Date().toISOString(),
      leads: {},
      list: [],
      note: "No orders in Prisma snapshot — scores empty but safe.",
    };
    writeStore(doc);
    return [];
  }

  /** @type {Record<string, object[]>} */
  const groups = {};
  rows.forEach((o) => {
    const key = String((o.email || "").trim().toLowerCase() || `name:${String(o.customerName || "").trim()}`);
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  });

  /** @type {object[]} */
  const list = [];
  Object.keys(groups).forEach((k) => {
    const arr = groups[k];
    const first = arr[0];
    const row = scoreLead(k, arr, { customerName: first.customerName, email: first.email });
    list.push(row);
  });

  list.sort((a, b) => b.score - a.score);

  /** @type {Record<string, object>} */
  const leads = {};
  list.forEach((x) => {
    leads[x.leadId] = x;
  });

  writeStore({
    generatedAt: new Date().toISOString(),
    leads,
    list,
    note: null,
  });

  return list;
}

function getTopLeads(limit) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 25));
  const st = readStore();
  const arr = Array.isArray(st.list) ? st.list.slice(0, lim) : [];
  if (arr.length) return arr;
  /** empty store message object for UI */
  return [];
}

async function getTopLeadsFresh(limit) {
  await scoreAllLeads();
  return getTopLeads(limit);
}

function getLeadById(leadId) {
  const st = readStore();
  if (!st.leads || !st.leads[String(leadId)]) return null;
  return st.leads[String(leadId)];
}

module.exports = {
  scoreLead,
  scoreAllLeads,
  getTopLeads,
  getTopLeadsFresh,
  getLeadById,
  readStore,
  CATS,
};
