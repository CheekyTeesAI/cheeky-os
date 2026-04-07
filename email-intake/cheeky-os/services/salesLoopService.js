/**
 * Bundle 28 — sales loop orchestration (composition only; no new I/O beyond reused services).
 */

const { getRevenueFollowups } = require("./revenueFollowups");
const { scoreFollowupOpportunities } = require("./followupScoringService");
const { runFollowupExecutor } = require("./followupExecutorService");
const { runInvoiceExecutor } = require("./invoiceExecutorService");

/**
 * @returns {Promise<{
 *   candidates: object[],
 *   summary: { messageReadyCount: number, invoiceReadyCount: number, highPriorityCount: number }
 * }>}
 */
async function buildSalesLoop() {
  const rev = await getRevenueFollowups();
  const unpaid = rev.unpaidInvoices || [];
  const stale = rev.staleEstimates || [];

  /** @type {Map<string, Record<string, unknown>>} */
  const metaById = new Map();
  for (const r of unpaid) {
    if (r && r.id) metaById.set(String(r.id), r);
  }
  for (const r of stale) {
    if (r && r.id) metaById.set(String(r.id), r);
  }

  const scored = scoreFollowupOpportunities(unpaid, stale).slice(0, 10);

  const candidates = scored.map((s) => {
    const meta = metaById.get(s.id) || {};
    const phone = String(
      (meta.phone != null ? meta.phone : s.phone) || ""
    ).trim();
    const email = String(
      (meta.email != null ? meta.email : s.email) || ""
    ).trim();
    const customerId = String(meta.customerId || "").trim();
    const amount = Number(s.amount) || 0;
    const pri = String(s.priority || "").toLowerCase();

    const messageReady = !!(phone || email);
    const invoiceReady = !!(customerId && amount >= 200);

    let recommendedAction = "manual_review";
    if (
      invoiceReady &&
      (pri === "critical" || pri === "high")
    ) {
      recommendedAction = "create_draft_invoice";
    } else if (messageReady) {
      recommendedAction = "send_followup";
    }

    return {
      customerName: String(s.customerName || "").trim(),
      customerId,
      phone,
      email,
      amount,
      daysOld: Number(s.daysOld) || 0,
      priority: s.priority || "",
      messageReady,
      invoiceReady,
      recommendedAction,
    };
  });

  let messageReadyCount = 0;
  let invoiceReadyCount = 0;
  let highPriorityCount = 0;
  for (const c of candidates) {
    if (c.messageReady) messageReadyCount++;
    if (c.invoiceReady) invoiceReadyCount++;
    const p = String(c.priority || "").toLowerCase();
    if (p === "critical" || p === "high") highPriorityCount++;
  }

  return {
    candidates,
    summary: {
      messageReadyCount,
      invoiceReadyCount,
      highPriorityCount,
    },
  };
}

/**
 * One coordinated cycle: existing executors enforce sends/draft caps and cooldowns.
 * @returns {Promise<{
 *   success: boolean,
 *   processed: number,
 *   followupsSent: number,
 *   draftInvoicesCreated: number,
 *   skipped: number,
 *   errors: string[]
 * }>}
 */
async function runSalesAutomationCycle() {
  let loop;
  try {
    loop = await buildSalesLoop();
  } catch (err) {
    return {
      success: false,
      processed: 0,
      followupsSent: 0,
      draftInvoicesCreated: 0,
      skipped: 0,
      errors: [String(err && err.message ? err.message : err)],
    };
  }

  const errors = [];
  let fu = { sent: 0, skipped: 0, errors: [] };
  let inv = { created: 0, skipped: 0, errors: [] };

  try {
    fu = await runFollowupExecutor();
  } catch (err) {
    fu = {
      sent: fu.sent,
      skipped: fu.skipped,
      errors: [String(err && err.message ? err.message : err)],
    };
  }

  if (Array.isArray(fu.errors)) {
    errors.push(...fu.errors);
  }

  try {
    inv = await runInvoiceExecutor();
  } catch (err) {
    inv = {
      created: inv.created,
      skipped: inv.skipped,
      errors: [String(err && err.message ? err.message : err)],
    };
  }

  if (Array.isArray(inv.errors)) {
    errors.push(...inv.errors);
  }

  const skipped = (fu.skipped || 0) + (inv.skipped || 0);
  const success = errors.length === 0;

  return {
    success,
    processed: loop.candidates.length,
    followupsSent: fu.sent || 0,
    draftInvoicesCreated: inv.created || 0,
    skipped,
    errors,
  };
}

module.exports = { buildSalesLoop, runSalesAutomationCycle };
