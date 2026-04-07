/**
 * Bundle 47 — ranked reactivation list from existing read-only buckets (no refactor).
 */

const { getReactivationBuckets } = require("./reactivationBuckets");
const { scoreReactivationCustomer } = require("./reactivationService");

const COHORT_START = new Date("2019-01-01T00:00:00.000Z").getTime();
const COHORT_END = new Date("2024-12-31T23:59:59.999Z").getTime();
const MAX_RAW = 100;

/**
 * @param {string} iso
 * @returns {boolean}
 */
function inReactivationCohort(iso) {
  const t = new Date(iso || "").getTime();
  return Number.isFinite(t) && t >= COHORT_START && t <= COHORT_END;
}

/**
 * @param {number} lifetimeSpend
 * @param {boolean} hasLastOrder
 * @returns {number}
 */
function inferOrderCount(lifetimeSpend, hasLastOrder) {
  const s = Number(lifetimeSpend) || 0;
  if (!hasLastOrder && s <= 0) return 0;
  if (s <= 0) return hasLastOrder ? 1 : 0;
  return Math.min(25, Math.max(1, Math.round(s / 300)));
}

/**
 * @param {{ hot?: object[], warm?: object[], cold?: object[] }} buckets
 * @returns {object[]}
 */
function mergeBucketsLimited(buckets) {
  const merged = [];
  for (const key of ["hot", "warm", "cold"]) {
    const arr = Array.isArray(buckets[key]) ? buckets[key] : [];
    for (const row of arr) {
      if (merged.length >= MAX_RAW) return merged;
      if (row && typeof row === "object") merged.push(row);
    }
  }
  return merged;
}

/**
 * @param {number} [limit]
 * @returns {Promise<{
 *   customers: object[],
 *   summary: { critical: number, high: number, medium: number, low: number }
 * }>}
 */
async function getReactivationTargets(limit = 20) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  /** @type {object[]} */
  const customers = [];

  let buckets = { hot: [], warm: [], cold: [] };
  try {
    buckets = await getReactivationBuckets();
  } catch (_) {
    buckets = { hot: [], warm: [], cold: [] };
  }

  const merged = mergeBucketsLimited(buckets);
  /** @type {{ customerName: string, score: number, reactivationPriority: string, reason: string, phone: string, email: string }[]} */
  const scoredRows = [];

  for (const row of merged) {
    const lastOrder = String(row.lastOrder || "").trim();
    if (!inReactivationCohort(lastOrder)) continue;

    const rawAmt = row.amount;
    const lifetimeSpend =
      typeof rawAmt === "number" && Number.isFinite(rawAmt)
        ? rawAmt
        : parseFloat(String(rawAmt || "0").replace(/[^0-9.-]/g, "")) || 0;

    const customerName = String(row.name || "").trim();
    if (!customerName) continue;

    const phone = String(row.phone || "").trim();
    const email = String(row.email || "").trim();
    const orderCount = inferOrderCount(lifetimeSpend, !!lastOrder);

    const scored = scoreReactivationCustomer({
      customerName,
      phone,
      email,
      lastOrderDate: lastOrder,
      lifetimeSpend,
      orderCount,
    });

    scoredRows.push({
      customerName,
      score: scored.score,
      reactivationPriority: scored.reactivationPriority,
      reason: scored.reason,
      phone,
      email,
    });
  }

  scoredRows.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  const cap = Math.max(1, Math.min(50, Math.floor(Number(limit) || 20)));
  const top = scoredRows.slice(0, cap);

  for (const c of top) {
    const p = String(c.reactivationPriority || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(summary, p)) summary[p]++;
    customers.push(c);
  }

  return { customers, summary };
}

module.exports = {
  getReactivationTargets,
  inReactivationCohort,
  MAX_RAW,
};
