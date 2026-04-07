/**
 * Bundle 42 — founder KPI snapshot service.
 */

const { getRecentEvents } = require("./actionLedgerService");
const { getActiveAlertsSorted } = require("./alertStoreService");
const { getApprovedExceptions } = require("./exceptionQueueService");
const {
  buildCashPrioritiesPayload,
  buildDepositPrioritiesPayload,
} = require("../routes/cash");

function isValidDate(d) {
  return d instanceof Date && Number.isFinite(d.getTime());
}

function toDate(v) {
  const d = new Date(v);
  return isValidDate(d) ? d : null;
}

function isSameLocalDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function withinLastDays(d, now, days) {
  const delta = now.getTime() - d.getTime();
  return delta >= 0 && delta <= days * 24 * 60 * 60 * 1000;
}

function countWhere(rows, fn) {
  let n = 0;
  for (const row of rows) {
    try {
      if (fn(row)) n++;
    } catch (_) {}
  }
  return n;
}

function lc(v) {
  return String(v || "").toLowerCase();
}

function isFollowupSentEvent(e) {
  const t = lc(e && e.type);
  const a = lc(e && e.action);
  const s = lc(e && e.status);
  return t === "followup" && s === "success" && (a.includes("sent") || a.includes("send"));
}

function isDraftInvoiceEvent(e) {
  const t = lc(e && e.type);
  const a = lc(e && e.action);
  const s = lc(e && e.status);
  return t === "invoice" && s === "success" && a.includes("draft");
}

function isProductionMoveEvent(e) {
  const t = lc(e && e.type);
  const a = lc(e && e.action);
  const s = lc(e && e.status);
  return t === "production" && s === "success" && (a.includes("advanced") || a.includes("move"));
}

function isApprovedExceptionEvent(e) {
  const t = lc(e && e.type);
  const s = lc(e && e.status);
  return t === "exception" && s === "approved";
}

function isBlockedEvent(e) {
  const s = lc(e && e.status);
  return s === "blocked" || s === "rejected";
}

/**
 * @returns {Promise<{
 *  today: {
 *    followupsSent: number,
 *    draftInvoicesCreated: number,
 *    productionMoves: number,
 *    criticalAlerts: number,
 *    cashPriorityCount: number,
 *    depositPriorityCount: number
 *  },
 *  week: {
 *    followupsSent: number,
 *    draftInvoicesCreated: number,
 *    productionMoves: number,
 *    approvedExceptions: number,
 *    blockedActions: number
 *  },
 *  highlights: {
 *    topCashOpportunity: string,
 *    topDepositOpportunity: string,
 *    systemHealth: "good" | "warning" | "critical"
 *  }
 * }>}
 */
async function getFounderKpiSnapshot() {
  const empty = {
    today: {
      followupsSent: 0,
      draftInvoicesCreated: 0,
      productionMoves: 0,
      criticalAlerts: 0,
      cashPriorityCount: 0,
      depositPriorityCount: 0,
    },
    week: {
      followupsSent: 0,
      draftInvoicesCreated: 0,
      productionMoves: 0,
      approvedExceptions: 0,
      blockedActions: 0,
    },
    highlights: {
      topCashOpportunity: "",
      topDepositOpportunity: "",
      systemHealth: "good",
    },
  };

  try {
    const now = new Date();
    const events = Array.isArray(getRecentEvents(200)) ? getRecentEvents(200) : [];
    const dated = events
      .map((e) => ({ e, d: toDate(e && e.createdAt) }))
      .filter((x) => !!x.d);
    const todayRows = dated.filter((x) => isSameLocalDay(x.d, now)).map((x) => x.e);
    const weekRows = dated
      .filter((x) => withinLastDays(x.d, now, 7))
      .map((x) => x.e);

    let cashPriorities = { opportunities: [] };
    let depositPriorities = { opportunities: [] };
    let criticalAlerts = 0;
    let approvedExceptions = [];
    try {
      cashPriorities = await buildCashPrioritiesPayload();
    } catch (_) {}
    try {
      depositPriorities = await buildDepositPrioritiesPayload();
    } catch (_) {}
    try {
      criticalAlerts = getActiveAlertsSorted().filter(
        (a) => lc(a && a.severity) === "critical"
      ).length;
    } catch (_) {
      criticalAlerts = 0;
    }
    try {
      approvedExceptions = getApprovedExceptions();
    } catch (_) {
      approvedExceptions = [];
    }

    empty.today.followupsSent = countWhere(todayRows, isFollowupSentEvent);
    empty.today.draftInvoicesCreated = countWhere(todayRows, isDraftInvoiceEvent);
    empty.today.productionMoves = countWhere(todayRows, isProductionMoveEvent);
    empty.today.criticalAlerts = Math.max(0, Math.floor(Number(criticalAlerts) || 0));
    empty.today.cashPriorityCount = Array.isArray(cashPriorities.opportunities)
      ? cashPriorities.opportunities.length
      : 0;
    empty.today.depositPriorityCount = Array.isArray(depositPriorities.opportunities)
      ? depositPriorities.opportunities.length
      : 0;

    empty.week.followupsSent = countWhere(weekRows, isFollowupSentEvent);
    empty.week.draftInvoicesCreated = countWhere(weekRows, isDraftInvoiceEvent);
    empty.week.productionMoves = countWhere(weekRows, isProductionMoveEvent);
    const approvedFromLedger = countWhere(weekRows, isApprovedExceptionEvent);
    const approvedFromService = countWhere(approvedExceptions, (ex) => {
      const d = toDate(ex && ex.resolvedAt);
      return !!d && withinLastDays(d, now, 7) && lc(ex && ex.status) === "approved";
    });
    empty.week.approvedExceptions = Math.max(approvedFromLedger, approvedFromService);
    empty.week.blockedActions = countWhere(weekRows, isBlockedEvent);

    const topCash = Array.isArray(cashPriorities.opportunities)
      ? cashPriorities.opportunities[0]
      : null;
    const topDeposit = Array.isArray(depositPriorities.opportunities)
      ? depositPriorities.opportunities[0]
      : null;
    empty.highlights.topCashOpportunity = topCash
      ? String(topCash.customerName || "").trim()
      : "";
    empty.highlights.topDepositOpportunity = topDeposit
      ? String(topDeposit.customerName || "").trim()
      : "";

    if (empty.week.blockedActions >= 8 || empty.today.criticalAlerts >= 2) {
      empty.highlights.systemHealth = "critical";
    } else if (empty.week.blockedActions > 0 || empty.today.criticalAlerts > 0) {
      empty.highlights.systemHealth = "warning";
    } else {
      empty.highlights.systemHealth = "good";
    }
  } catch (_) {}

  return empty;
}

module.exports = {
  getFounderKpiSnapshot,
};
