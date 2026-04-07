/**
 * Bundle 47 — deterministic reactivation scoring (2019–2024 cohort mapping happens in targets helper).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = (365.25 / 12) * DAY_MS;

/**
 * @param {string} iso
 * @returns {{ points: number, label: string, flag: string }}
 */
function recencyPart(iso) {
  const t = new Date(iso || "").getTime();
  if (!Number.isFinite(t) || t <= 0) {
    return { points: 0, label: "unknown", flag: "" };
  }
  const ageMonths = (Date.now() - t) / MONTH_MS;
  if (ageMonths <= 6) return { points: 20, label: "recent", flag: "recency_6mo" };
  if (ageMonths <= 12) return { points: 10, label: "within_year", flag: "recency_12mo" };
  return { points: 5, label: "older", flag: "recency_older" };
}

/**
 * @param {number} spend
 * @returns {{ points: number, flag: string }}
 */
function valuePart(spend) {
  const s = Number(spend) || 0;
  if (s >= 2000) return { points: 30, flag: "value_2000" };
  if (s >= 1000) return { points: 20, flag: "value_1000" };
  if (s >= 300) return { points: 10, flag: "value_300" };
  return { points: 0, flag: "" };
}

/**
 * @param {number} orderCount
 * @returns {{ points: number, flag: string }}
 */
function frequencyPart(orderCount) {
  const n = Math.max(0, Math.floor(Number(orderCount) || 0));
  if (n >= 5) return { points: 20, flag: "freq_5plus" };
  if (n >= 3) return { points: 10, flag: "freq_3plus" };
  if (n >= 2) return { points: 5, flag: "freq_2" };
  return { points: 0, flag: "" };
}

/**
 * @param {number} lifetimeSpend
 * @param {number} orderCount
 * @param {string} recencyLabel
 * @returns {string}
 */
function buildReason(lifetimeSpend, orderCount, recencyLabel) {
  const parts = [];
  const s = Math.round(Number(lifetimeSpend) || 0);
  if (s >= 300) parts.push(`$${s} lifetime`);
  const oc = Math.floor(Number(orderCount) || 0);
  if (oc >= 2) parts.push(`${oc} orders`);
  else if (oc === 1) parts.push("1 order");

  if (recencyLabel === "recent") parts.push("recent");
  else if (recencyLabel === "within_year") parts.push("within a year");
  else if (recencyLabel === "older") parts.push("older activity");

  if (!parts.length) return "reactivation candidate";
  return parts.join(" + ");
}

/**
 * @param {number} score
 * @returns {"low"|"medium"|"high"|"critical"}
 */
function band(score) {
  const n = Number(score) || 0;
  if (n >= 60) return "critical";
  if (n >= 40) return "high";
  if (n >= 20) return "medium";
  return "low";
}

/**
 * @param {{
 *   customerName?: string,
 *   phone?: string,
 *   email?: string,
 *   lastOrderDate?: string,
 *   lifetimeSpend?: number,
 *   orderCount?: number
 * }} input
 * @returns {{
 *   score: number,
 *   reactivationPriority: "low"|"medium"|"high"|"critical",
 *   reason: string,
 *   flags: string[]
 * }}
 */
function scoreReactivationCustomer(input) {
  const src = input && typeof input === "object" ? input : {};
  const lifetimeSpend = Number(src.lifetimeSpend) || 0;
  const orderCount = Math.max(0, Math.floor(Number(src.orderCount) || 0));
  const phone = String(src.phone || "").trim();
  const email = String(src.email || "").trim();
  const lastOrderDate = String(src.lastOrderDate || "").trim();

  const r = recencyPart(lastOrderDate);
  const v = valuePart(lifetimeSpend);
  const f = frequencyPart(orderCount);
  let contact = 0;
  /** @type {string[]} */
  const flags = [];
  if (r.flag) flags.push(r.flag);
  if (v.flag) flags.push(v.flag);
  if (f.flag) flags.push(f.flag);
  if (phone) {
    contact += 10;
    flags.push("has_phone");
  }
  if (email) {
    contact += 5;
    flags.push("has_email");
  }

  const score = r.points + v.points + f.points + contact;
  const reactivationPriority = band(score);
  const reason = buildReason(lifetimeSpend, orderCount, r.label);

  return {
    score,
    reactivationPriority,
    reason,
    flags,
  };
}

module.exports = {
  scoreReactivationCustomer,
};
