"use strict";

const graphEmailConnector = require("../connectors/graphEmailConnector");
const squareReadConnector = require("../connectors/squareReadConnector");
const productionReadConnector = require("../connectors/productionReadConnector");

function semanticTaskEngineBrief() {
  try {
    const semanticTaskEngine = require("../memory/semanticTaskEngine");
    const hits = semanticTaskEngine.findRelatedTasks({ intent: "operations", target: "daily brief risks" }, 3);
    return {
      success: hits.success,
      top: (hits.related || []).slice(0, 2).map((h) => ({ score: h.score, taskId: h.taskId })),
    };
  } catch (_e) {
    return { success: false, top: [] };
  }
}

async function buildDailyBriefing() {
  try {
    const isoDate = new Date().toISOString().slice(0, 10);

    const rd = await squareReadConnector.readiness();
    let revenuePulse = { ok: false };
    let unpaid = { ok: false, items: [] };
    let estimates = { ok: false, staleOpenOrders: [] };

    if (rd && rd.authVerified && rd.locationId) {
      try {
        revenuePulse = await squareReadConnector.getRevenueSnapshot(7);
      } catch (_e1) {
        revenuePulse = { ok: false };
      }
      try {
        unpaid = await squareReadConnector.findUnpaidInvoices();
      } catch (_e2) {
        unpaid = { ok: false, items: [] };
      }
      try {
        estimates = await squareReadConnector.getEstimateFollowups();
      } catch (_e3) {
        estimates = { ok: false, staleOpenOrders: [] };
      }
    } else {
      revenuePulse = { ok: false, note: "square_not_ready" };
      unpaid = { ok: false, items: [] };
      estimates = { ok: false, staleOpenOrders: [] };
    }

    const late = await productionReadConnector.getLateJobs();
    const deposit = await productionReadConnector.getWaitingOnDeposit();
    const today = await productionReadConnector.getTodaysPriorityList(25);

    let emailFollowups = { ok: false, candidates: [] };
    if (graphEmailConnector.isConfigured()) {
      try {
        emailFollowups = await graphEmailConnector.detectFollowUpCandidates(15);
      } catch (_e4) {
        emailFollowups = { ok: false, candidates: [] };
      }
    }

    const memoryInsights = semanticTaskEngineBrief();

    const cashRisks = [];
    const productionRisks = [];
    const followups = [];

    try {
      if (unpaid.ok && unpaid.items && unpaid.items.length) {
        cashRisks.push({
          type: "unpaid_invoice_pattern",
          count: unpaid.items.length,
          sample: unpaid.items.slice(0, 5),
        });
      }
    } catch (_e6) {}

    try {
      if (estimates.ok && estimates.staleOpenOrders && estimates.staleOpenOrders.length) {
        cashRisks.push({
          type: "stale_square_open_orders",
          count: estimates.staleOpenOrders.length,
          sampleIds: estimates.staleOpenOrders.slice(0, 5).map((o) => o.id),
        });
      }
    } catch (_e7) {}

    try {
      if (late.ok && late.count) productionRisks.push({ type: "late_jobs", count: late.count });
    } catch (_e8) {}

    try {
      const dlen = Array.isArray(deposit.preview) ? deposit.preview.length : 0;
      if (dlen) productionRisks.push({ type: "waiting_deposit_proxy", count: dlen, source: deposit.source });
    } catch (_e9) {}

    try {
      if (emailFollowups.ok && emailFollowups.candidates && emailFollowups.candidates.length) {
        followups.push({ type: "mailbox_heuristic", preview: emailFollowups.candidates.slice(0, 5) });
      }
    } catch (_e10) {}

    try {
      if (estimates.ok && estimates.staleOpenOrders && estimates.staleOpenOrders.length) {
        followups.push({
          type: "estimate_follow_up_proxy",
          count: estimates.staleOpenOrders.length,
        });
      }
    } catch (_e11) {}

    let recommendedFocus =
      "Stabilize cash: confirm top unpaid invoices + waiting-on-deposit boards before taking new creative risk.";
    try {
      if (today.ok && today.items && today.items.length) {
        const top = today.items[0];
        recommendedFocus = `Operational focus: address ${top.reason} for ${JSON.stringify(top.ref)} (auto-ranked slice).`;
      }
    } catch (_e12) {}

    return {
      success: true,
      date: isoDate,
      revenuePulse,
      unpaidInvoicesApprox: unpaid.ok ? unpaid.items || [] : [],
      estimateFollowUpsApprox: estimates.ok ? estimates.staleOpenOrders || [] : [],
      productionLate: late,
      waitingOnDeposit: deposit,
      productionToday: today,
      mailboxFollowups: emailFollowups,
      memoryInsights,
      cashRisks,
      productionRisks,
      followups,
      recommendedFocus,
    };
  } catch (e) {
    return {
      success: false,
      date: new Date().toISOString().slice(0, 10),
      error: e.message || String(e),
    };
  }
}

module.exports = {
  buildDailyBriefing,
};
