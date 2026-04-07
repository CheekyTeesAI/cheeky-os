/**
 * Bundle 46 — immediate revenue targets from cash + deposit priorities (no extra DB in this module).
 */

const {
  buildCashPrioritiesPayload,
  buildDepositPrioritiesPayload,
} = require("../routes/cash");
const { runFollowupExecutor } = require("./followupExecutorService");
const { runInvoiceExecutor } = require("./invoiceExecutorService");
const { recordLedgerEventSafe } = require("./actionLedgerService");

const MIN_AMOUNT = 200;
const MAX_TARGETS = 8;

function lc(s) {
  return String(s || "").toLowerCase();
}

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} recommendedAction
 * @returns {"invoice" | "followup"}
 */
function cashTypeFromAction(recommendedAction) {
  const a = lc(recommendedAction);
  if (a === "create_draft_invoice") return "invoice";
  return "followup";
}

/**
 * @returns {Promise<{ targets: object[], summary: { totalTargets: number, totalValue: number } }>}
 */
async function getCashBlitzPayload() {
  const summary = { totalTargets: 0, totalValue: 0 };
  /** @type {object[]} */
  const raw = [];

  let cash = { opportunities: [] };
  let dep = { opportunities: [] };
  try {
    cash = await buildCashPrioritiesPayload();
  } catch (_) {
    cash = { opportunities: [] };
  }
  try {
    dep = await buildDepositPrioritiesPayload();
  } catch (_) {
    dep = { opportunities: [] };
  }

  for (const o of cash.opportunities || []) {
    if (!o || typeof o !== "object") continue;
    const pri = lc(o.cashPriority);
    if (pri !== "critical" && pri !== "high") continue;
    const amount = Number(o.amount) || 0;
    if (amount < MIN_AMOUNT) continue;
    const typ = cashTypeFromAction(o.recommendedAction);
    raw.push({
      customerName: String(o.customerName || "").trim(),
      amount,
      type: typ,
      priority: pri === "critical" ? "critical" : "high",
      reason: String(o.reason || "Cash priority"),
      _sort: amount,
      _key: normName(o.customerName) + "|" + typ,
    });
  }

  for (const o of dep.opportunities || []) {
    if (!o || typeof o !== "object") continue;
    const pri = lc(o.depositPriority);
    if (pri !== "critical" && pri !== "high") continue;
    const amount = Number(o.amount) || 0;
    if (amount < MIN_AMOUNT) continue;
    raw.push({
      customerName: String(o.customerName || "").trim(),
      amount,
      type: "deposit",
      priority: pri === "critical" ? "critical" : "high",
      reason: String(o.reason || "Deposit / payment gate"),
      _sort: amount,
      _key: normName(o.customerName) + "|deposit",
    });
  }

  raw.sort((a, b) => (Number(b._sort) || 0) - (Number(a._sort) || 0));

  /** @type {Map<string, object>} */
  const best = new Map();
  for (const row of raw) {
    const k = String(row._key || "").trim();
    if (!k) continue;
    const prev = best.get(k);
    if (!prev || (Number(row.amount) || 0) > (Number(prev.amount) || 0)) {
      best.set(k, row);
    }
  }

  const merged = Array.from(best.values()).sort(
    (a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)
  );

  const targets = merged.slice(0, MAX_TARGETS).map((r) => ({
    customerName: r.customerName,
    amount: r.amount,
    type: r.type,
    priority: r.priority,
    reason: r.reason,
  }));

  let totalValue = 0;
  for (const t of targets) {
    totalValue += Math.max(0, Number(t.amount) || 0);
  }
  summary.totalTargets = targets.length;
  summary.totalValue = Math.round(totalValue);

  return { targets, summary };
}

/**
 * @returns {Promise<{ success: boolean, targets: object[], executed: object[], summary: object }>}
 */
async function runCashBlitz() {
  const { targets, summary: blitzSummary } = await getCashBlitzPayload();
  const executed = [];
  const outSummary = {
    totalTargets: blitzSummary.totalTargets,
    totalValue: blitzSummary.totalValue,
    followupsSent: 0,
    invoicesCreated: 0,
  };

  const needFollowup = targets.some((t) => t.type === "deposit" || t.type === "followup");
  const needInvoice = targets.some((t) => t.type === "invoice");

  if (targets.length === 0) {
    try {
      recordLedgerEventSafe({
        type: "autopilot",
        action: "cash_blitz_skipped",
        status: "skipped",
        reason: "No qualifying cash blitz targets (amount/priority)",
      });
    } catch (_) {}
    return {
      success: true,
      targets,
      executed,
      summary: outSummary,
    };
  }

  try {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "cash_blitz_start",
      status: "info",
      reason: `${targets.length} targets · $${blitzSummary.totalValue}`,
      meta: {
        needFollowup,
        needInvoice,
      },
    });
  } catch (_) {}

  if (needFollowup) {
    try {
      const r = await runFollowupExecutor();
      const sent = Math.max(0, Math.floor(Number(r.sent) || 0));
      outSummary.followupsSent = sent;
      executed.push({ kind: "followup", sent: r.sent, skipped: r.skipped, errors: r.errors });
    } catch (err) {
      executed.push({
        kind: "followup",
        error: String(err && err.message ? err.message : err),
      });
    }
  }

  if (needInvoice) {
    try {
      const r = await runInvoiceExecutor();
      const created = Math.max(0, Math.floor(Number(r.created) || 0));
      outSummary.invoicesCreated = created;
      executed.push({ kind: "invoice", created: r.created, skipped: r.skipped, errors: r.errors });
    } catch (err) {
      executed.push({
        kind: "invoice",
        error: String(err && err.message ? err.message : err),
      });
    }
  }

  try {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "cash_blitz_complete",
      status: "success",
      reason: `followups:${outSummary.followupsSent} invoices:${outSummary.invoicesCreated}`,
      meta: { totalTargets: outSummary.totalTargets },
    });
  } catch (_) {}

  return {
    success: true,
    targets,
    executed,
    summary: outSummary,
  };
}

module.exports = {
  getCashBlitzPayload,
  runCashBlitz,
  MIN_AMOUNT,
  MAX_TARGETS,
};
