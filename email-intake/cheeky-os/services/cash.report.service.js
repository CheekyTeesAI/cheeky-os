"use strict";

/**
 * PHASE 6 — Daily Cash Report Service
 * Aggregates draft store, history, and live invoice data into a cash summary.
 *
 * FAIL SAFE: always returns a valid object. NO AUTO-SEND.
 */

const store        = require("./followup.store");
const followupData = require("./followup.data.service");
const dailyRunner  = require("./daily.cash.runner");

/**
 * Build the daily cash report.
 * @returns {Promise<object>}
 */
async function getCashReport() {
  const summary = store.getSummary();
  const history = store.getAllHistory();
  const runnerStatus = dailyRunner.getStatus();

  // Count drafts created today
  const today = new Date().toDateString();
  const allDrafts = store.getDrafts();
  const draftsCreatedToday = allDrafts.filter((d) => {
    try { return new Date(d.createdAt).toDateString() === today; } catch (_) { return false; }
  }).length;

  const draftsSentToday = allDrafts.filter((d) => {
    try { return d.status === "sent" && new Date(d.sentAt || d.createdAt).toDateString() === today; } catch (_) { return false; }
  }).length;

  // Compute total outstanding from drafts in store
  const unpaidTotal = allDrafts
    .filter((d) => d.status !== "sent")
    .reduce((sum, d) => sum + Number(d.amount || 0), 0);

  // History stats
  const historyEntries = Object.values(history);
  const followUpsBlocked = historyEntries.filter((h) => {
    if (!h.lastFollowUp) return false;
    return Date.now() - new Date(h.lastFollowUp).getTime() < 48 * 60 * 60 * 1000;
  }).length;

  // Attempt live invoice count from data service
  let liveUnpaidCount = summary.total;
  let liveUnpaidTotal = unpaidTotal;
  try {
    const invoices = await followupData.getUnpaidInvoices(50);
    liveUnpaidCount = invoices.length;
    liveUnpaidTotal = invoices.reduce((sum, inv) => sum + Number(inv.amount || 0), 0);
  } catch (_) {}

  return {
    generatedAt: new Date().toISOString(),
    // Core cash numbers
    unpaidTotal: Math.round(liveUnpaidTotal * 100) / 100,
    invoicesCount: liveUnpaidCount,
    // Follow-up activity
    draftsCreatedToday,
    draftsSentToday,
    followUpsBlocked,
    totalDraftsInStore: summary.total,
    draftsByStatus: {
      draft: summary.draft,
      approved: summary.approved,
      sent: summary.sent,
    },
    // Scheduler health
    schedulerRunning: runnerStatus.started,
    schedulerRunCount: runnerStatus.runCount,
    lastAutoRunAt: runnerStatus.lastRunAt,
    lastRunResult: runnerStatus.lastRunResult,
    // Top opportunities (highest amount, not yet followed up recently)
    topOpportunities: Object.values(history)
      .sort((a, b) => b.followUpCount - a.followUpCount)
      .slice(0, 5)
      .map((h) => ({
        invoiceId: h.invoiceId,
        followUpCount: h.followUpCount,
        lastFollowUp: h.lastFollowUp,
        eligible: Date.now() - new Date(h.lastFollowUp).getTime() >= 48 * 60 * 60 * 1000,
      })),
  };
}

module.exports = { getCashReport };
