/**
 * Bundle 5 — pure scoring for follow-up opportunities (no DB / no I/O).
 */

const MAX_INPUT = 20;

function parseAmount(v) {
  const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function hasPhone(phone) {
  return !!(phone && String(phone).trim());
}

function hasEmail(email) {
  return !!(email && String(email).trim());
}

function priorityFromScore(score) {
  if (score >= 40) return "critical";
  if (score >= 25) return "high";
  if (score >= 15) return "medium";
  return "low";
}

function buildReason(daysOld, amountNum, phone, email) {
  const parts = [`${daysOld} days old`, `$${Math.round(amountNum)}`];
  if (hasPhone(phone)) parts.push("has phone");
  if (hasEmail(email)) parts.push("has email");
  return parts.join(" + ");
}

function scoreRow(daysOld, amountNum, phone, email) {
  let score = Math.max(0, Math.floor(Number(daysOld) || 0));
  if (amountNum >= 500) score += 20;
  if (amountNum >= 250) score += 10;
  if (hasPhone(phone)) score += 10;
  if (hasEmail(email)) score += 5;
  return score;
}

/**
 * @param {object} row
 * @returns {object | null}
 */
function fromInvoice(row) {
  if (!row || typeof row !== "object") return null;
  const id = String(row.id || "").trim();
  const customerName = String(row.customerName || "").trim() || "Unknown Customer";
  const phone = row.phone;
  const email = row.email;
  const amountNum = parseAmount(row.amount);
  const daysOld = Math.max(0, Math.floor(Number(row.daysPastDue) || 0));
  const score = scoreRow(daysOld, amountNum, phone, email);
  const priority = priorityFromScore(score);
  const reason = buildReason(daysOld, amountNum, phone, email);
  return {
    id,
    type: "invoice",
    customerName,
    phone: hasPhone(phone) ? String(phone).trim() : "",
    email: hasEmail(email) ? String(email).trim() : "",
    amount: amountNum,
    daysOld,
    score,
    priority,
    reason,
  };
}

/**
 * @param {object} row
 * @returns {object | null}
 */
function fromEstimate(row) {
  if (!row || typeof row !== "object") return null;
  const id = String(row.id || "").trim();
  const customerName = String(row.customerName || "").trim() || "Unknown Customer";
  const phone = row.phone;
  const email = row.email;
  const amountNum = parseAmount(row.amount);
  const daysOld = Math.max(0, Math.floor(Number(row.daysOld) || 0));
  const score = scoreRow(daysOld, amountNum, phone, email);
  const priority = priorityFromScore(score);
  const reason = buildReason(daysOld, amountNum, phone, email);
  return {
    id,
    type: "estimate",
    customerName,
    phone: hasPhone(phone) ? String(phone).trim() : "",
    email: hasEmail(email) ? String(email).trim() : "",
    amount: amountNum,
    daysOld,
    score,
    priority,
    reason,
  };
}

/**
 * @param {unknown[]} unpaidInvoices
 * @param {unknown[]} staleEstimates
 * @returns {Array<{
 *   id: string,
 *   type: 'invoice'|'estimate',
 *   customerName: string,
 *   phone: string,
 *   email: string,
 *   amount: number,
 *   daysOld: number,
 *   score: number,
 *   priority: string,
 *   reason: string
 * }>}
 */
function scoreFollowupOpportunities(unpaidInvoices, staleEstimates) {
  const out = [];
  const unpaid = Array.isArray(unpaidInvoices) ? unpaidInvoices : [];
  const stale = Array.isArray(staleEstimates) ? staleEstimates : [];

  for (const row of unpaid) {
    if (out.length >= MAX_INPUT) break;
    const item = fromInvoice(row);
    if (item) out.push(item);
  }
  for (const row of stale) {
    if (out.length >= MAX_INPUT) break;
    const item = fromEstimate(row);
    if (item) out.push(item);
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Strip scoring fields for GET /revenue/auto-followups.
 * @param {ReturnType<typeof scoreFollowupOpportunities>[number]} s
 */
function toTopActionShape(s) {
  return {
    customerName: s.customerName,
    phone: s.phone,
    email: s.email,
    amount: s.amount,
    daysOld: s.daysOld,
    priority: s.priority,
    reason: s.reason,
  };
}

module.exports = {
  scoreFollowupOpportunities,
  toTopActionShape,
  MAX_INPUT,
};
