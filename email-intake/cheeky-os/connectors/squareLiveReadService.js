"use strict";

/**
 * READ-ONLY Square visibility with disk-backed last-good snapshot — never crashes callers.
 */

const sq = require("../integrations/square");
const squareReadConnector = require("./squareReadConnector");
const snapshotCache = require("../cache/squareSnapshotCache");

/**
 * Builds an operational envelope for cockpit dashboards — always returns `{ status, cachedAt?, data?, message? }`.
 */
async function refreshSquareOperationalSnapshot() {
  const prev = snapshotCache.readSnapshotDisk();
  const staleEnvelope = () => ({
    status: "cached",
    message: "Square unavailable. Showing last successful snapshot.",
    cachedAt: prev.cachedAt || null,
    data: prev.data && typeof prev.data === "object" ? prev.data : {},
  });

  try {
    if (!squareReadConnector.isConfiguredSync || !squareReadConnector.isConfiguredSync()) {
      const out = staleEnvelope();
      if (!out.data || !Object.keys(out.data).length) {
        out.message =
          "Square credentials not configured. Cash cards show safe placeholders until you connect tokens.";
      }
      return out;
    }
  } catch (_e) {
    return staleEnvelope();
  }

  try {
    await sq.initializeSquareIntegration();
  } catch (_eInit) {}

  /** @type {object} */
  const data = {};

  try {
    const pack = await squareReadConnector.findUnpaidInvoices();
    data.unpaidInvoices = pack && pack.items ? pack.items.slice(0, 80) : [];
    data.unpaidInvoiceApprox = Array.isArray(data.unpaidInvoices) ? data.unpaidInvoices.length : 0;
  } catch (_eU) {
    data.unpaidInvoices = [];
    data.unpaidInvoiceApprox = 0;
  }

  try {
    const pay = await squareReadConnector.listRecentPayments(14);
    data.recentPayments = pay && Array.isArray(pay.payments) ? pay.payments.slice(0, 50) : [];
  } catch (_eP) {
    data.recentPayments = [];
  }

  try {
    const est = await squareReadConnector.getEstimateFollowups();
    data.estimateFollowups = est && est.staleOpenOrders ? est.staleOpenOrders.slice(0, 60) : [];
  } catch (_eE) {
    data.estimateFollowups = [];
  }

  try {
    if (typeof squareReadConnector.getRevenueSnapshot === "function") {
      const rev = await squareReadConnector.getRevenueSnapshot(14);
      if (rev && typeof rev === "object") data.revenueSnapshot = rev;
    }
  } catch (_eR) {}

  data.depositBalancesDueApprox = summarizeBalancesDue(data.unpaidInvoices);
  data.cashRiskSummary = {
    unpaidCount: data.unpaidInvoiceApprox || 0,
    staleEstimateCount: Array.isArray(data.estimateFollowups) ? data.estimateFollowups.length : 0,
    note: "Square stays the finance source of truth — match unpaid totals to shop deposit gates.",
  };

  const cachedAt = new Date().toISOString();
  try {
    snapshotCache.writeSnapshotDisk({ cachedAt, data });
  } catch (_eW) {}

  return {
    status: "fresh",
    message: null,
    cachedAt,
    data,
  };
}

function summarizeBalancesDue(unpaid) {
  let cents = 0;
  try {
    (Array.isArray(unpaid) ? unpaid : []).forEach((r) => {
      const c = Number(r.computedDueCents || 0);
      if (Number.isFinite(c)) cents += c;
    });
  } catch (_e) {}
  return { computedDueCents: cents };
}

module.exports = {
  refreshSquareOperationalSnapshot,
};
