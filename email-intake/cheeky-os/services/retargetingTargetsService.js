/**
 * Bundle 51 — ranked retargeting list from leads + revenue follow-ups (read-only reuse).
 */

const { getRecentLeads } = require("./leadRecentQueue");
const { getRevenueFollowups } = require("./revenueFollowups");
const { computeQuickQuote } = require("./quickQuoteService");
const {
  scoreRetargetingCandidate,
  inferLeadLastStatus,
} = require("./retargetingService");
const { normalizeE164 } = require("./followupExecutorService");

const MAX_CANDIDATES = 60;
const TOP_N = 15;

/**
 * @param {string} s
 * @returns {string}
 */
function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} name
 * @param {string} phone
 * @param {string} email
 * @returns {string}
 */
function dedupeKey(name, phone, email) {
  const p = normalizeE164(phone);
  if (p) return "p:" + p;
  const em = String(email || "")
    .trim()
    .toLowerCase();
  if (em) return "e:" + em;
  return "n:" + normName(name);
}

/**
 * @param {string} iso
 * @returns {number}
 */
function daysSinceIso(iso) {
  const t = new Date(iso || "").getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

/**
 * @returns {Promise<{ targets: object[], summary: Record<string, number> }>}
 */
async function getRetargetingTargets() {
  const summary = { critical: 0, high: 0, medium: 0, low: 0 };
  /** @type {Map<string, object>} */
  const best = new Map();

  function consider(row) {
    const scored = scoreRetargetingCandidate(row);
    if (!scored) return;
    const key = dedupeKey(
      String(row.customerName || ""),
      String(row.phone || ""),
      String(row.email || "")
    );
    const prev = best.get(key);
    if (!prev || scored.score > prev.score) {
      best.set(key, {
        customerName: String(row.customerName || "").trim(),
        phone: String(row.phone || "").trim(),
        email: String(row.email || "").trim(),
        amount: Math.max(0, Number(row.amount) || 0),
        daysSinceLastContact: Math.max(
          0,
          Math.floor(Number(row.daysSinceLastContact) || 0)
        ),
        score: scored.score,
        retargetPriority: scored.retargetPriority,
        reason: scored.reason,
        flags: scored.flags,
      });
    }
  }

  const leads = getRecentLeads(MAX_CANDIDATES);
  for (const L of leads) {
    const days = daysSinceIso(L.capturedAt);
    if (days < 3) continue;
    const message = String(L.message || "");
    const lastStatus = inferLeadLastStatus(message, days);
    const quote = computeQuickQuote({
      message,
      quantity: null,
      printType: "",
      productType: "",
    });
    consider({
      customerName: String(L.leadName || "").trim(),
      phone: L.phone,
      email: L.email,
      amount: Math.max(0, Number(quote.estimatedTotal) || 0),
      daysSinceLastContact: days,
      lastStatus,
      sourceType: "lead",
      hasOrder: false,
    });
  }

  let rev = { unpaidInvoices: [], staleEstimates: [] };
  try {
    rev = await getRevenueFollowups();
  } catch (_) {
    rev = { unpaidInvoices: [], staleEstimates: [] };
  }

  for (const row of rev.unpaidInvoices || []) {
    if (!row || typeof row !== "object") continue;
    const daysOld = Math.max(
      0,
      Math.floor(Number(row.daysPastDue) || 0)
    );
    if (daysOld < 3) continue;
    const amount = parseFloat(
      String(row.amount || "0").replace(/[^0-9.-]/g, "")
    );
    consider({
      customerName: String(row.customerName || "").trim(),
      phone: row.phone,
      email: row.email,
      amount: Number.isFinite(amount) ? amount : 0,
      daysSinceLastContact: daysOld,
      lastStatus: "no_response",
      sourceType: "customer",
      hasOrder: false,
    });
  }

  for (const row of rev.staleEstimates || []) {
    if (!row || typeof row !== "object") continue;
    const daysOld = Math.max(0, Math.floor(Number(row.daysOld) || 0));
    if (daysOld < 3) continue;
    const amount = parseFloat(
      String(row.amount || "0").replace(/[^0-9.-]/g, "")
    );
    consider({
      customerName: String(row.customerName || "").trim(),
      phone: row.phone,
      email: row.email,
      amount: Number.isFinite(amount) ? amount : 0,
      daysSinceLastContact: daysOld,
      lastStatus: "stale",
      sourceType: "quote",
      hasOrder: false,
    });
  }

  const merged = Array.from(best.values()).sort(
    (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
  );
  const targets = merged.slice(0, TOP_N);

  for (const t of targets) {
    const p = String(t.retargetPriority || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(summary, p)) summary[p]++;
  }

  return { targets, summary };
}

module.exports = {
  getRetargetingTargets,
  TOP_N,
};
