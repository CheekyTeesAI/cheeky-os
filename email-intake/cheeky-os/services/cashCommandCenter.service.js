"use strict";

const path = require("path");
const {
  getCashRisks,
  effectiveTotal,
  effectiveDepositRequired,
  depositCollected,
  needsBlanks,
} = require("./cashRiskEngine.service");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function startEndTodayUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/** @param {import("@prisma/client").Order} o */
function paymentUsdToday(o, start, end) {
  const depT = o.depositPaidAt ? new Date(o.depositPaidAt) : null;
  const finT = o.finalPaidAt ? new Date(o.finalPaidAt) : null;
  const inDep = depT && depT >= start && depT < end;
  const inFin = finT && finT >= start && finT < end;
  if (inFin) return effectiveTotal(o);
  if (inDep) return Math.min(effectiveDepositRequired(o), Number(o.amountPaid || 0));
  return 0;
}

/** @param {import("@prisma/client").Order} o */
function listItemFromOrder(o, extra = {}) {
  const total = effectiveTotal(o);
  const paid = Number(o.amountPaid || 0);
  return {
    orderId: o.id,
    customerName: o.customerName,
    email: o.email || "",
    status: o.status,
    totalUsd: total,
    amountPaidUsd: paid,
    balanceUsd: Math.max(0, total - paid),
    depositRequiredUsd: effectiveDepositRequired(o),
    depositCollected: depositCollected(o),
    ...extra,
  };
}

/**
 * @returns {Promise<object>}
 */
async function buildCashCommandCenter() {
  const prisma = getPrisma();
  const empty = {
    today: {
      paymentsReceived: 0,
      depositsReceived: 0,
      invoicesPaid: 0,
      invoicesPartiallyPaid: 0,
    },
    openMoney: {
      unpaidQuotes: [],
      unpaidInvoices: [],
      partialDeposits: [],
      overdueBalances: [],
    },
    productionRisk: {
      depositPaidButNotReady: [],
      blanksNeededButNotFunded: [],
      ordersAtRiskDueToCash: [],
    },
    nextCashActions: [],
  };

  if (!prisma || !prisma.order) {
    const risk = getCashRisks({ orders: [], quotes: [] });
    const nextCashActions = risk.recommendedActions.map((a) => ({
      action: a.action,
      priority: a.priority,
      orderId: a.orderId || null,
      quoteId: a.quoteId || null,
      customerName: a.customerName || "",
      amountUsd: a.amountUsd ?? a.totalUsd ?? null,
    }));
    return { ...empty, nextCashActions, risk };
  }

  const { start, end } = startEndTodayUtc();

  const orders = await prisma.order.findMany({
    where: { deletedAt: null },
    include: { quotes: true },
    orderBy: { updatedAt: "desc" },
    take: 1500,
  });

  const quotesFlat = [];
  for (const o of orders) {
    for (const q of o.quotes || []) {
      quotesFlat.push({ ...q, order: o });
    }
  }

  let payToday = 0;
  let depToday = 0;
  let invPaidToday = 0;
  let invPartialToday = 0;

  for (const o of orders) {
    payToday += paymentUsdToday(o, start, end);
    const depT = o.depositPaidAt ? new Date(o.depositPaidAt) : null;
    const finT = o.finalPaidAt ? new Date(o.finalPaidAt) : null;
    if (depT && depT >= start && depT < end) {
      depToday += Math.min(effectiveDepositRequired(o), Number(o.amountPaid || 0));
    }
    if (finT && finT >= start && finT < end) invPaidToday += 1;
    const tot = effectiveTotal(o);
    const paid = Number(o.amountPaid || 0);
    if (paid > 1e-6 && paid + 1e-6 < tot) {
      const touch = o.updatedAt ? new Date(o.updatedAt) : null;
      if (touch && touch >= start && touch < end) invPartialToday += 1;
    }
  }

  const unpaidQuotes = [];
  const unpaidInvoices = [];
  const partialDeposits = [];
  const overdueBalances = [];
  const depositPaidButNotReady = [];
  const blanksNeededButNotFunded = [];

  const now = Date.now();

  for (const o of orders) {
    if (o.deletedAt) continue;
    const st = String(o.status || "").toUpperCase();
    if (st === "CANCELLED") continue;

    const total = effectiveTotal(o);
    const paid = Number(o.amountPaid || 0);
    const hasDep = depositCollected(o);

    for (const q of o.quotes || []) {
      const qs = String(q.status || "").toUpperCase();
      if (["SENT", "OPEN", "DRAFT", "PENDING"].includes(qs) && !hasDep && total > 0) {
        unpaidQuotes.push({
          quoteId: q.id,
          ...listItemFromOrder(o, { quoteStatus: q.status, quoteTotal: q.total }),
        });
      }
    }

    if (total > 1e-6 && paid + 1e-6 < total) {
      unpaidInvoices.push(listItemFromOrder(o));
    }

    if (hasDep && paid + 1e-6 < total) {
      partialDeposits.push(listItemFromOrder(o));
    }

    const exp = o.invoiceExpiresAt || o.quoteExpiresAt;
    if (exp) {
      const expMs = new Date(exp).getTime();
      if (!Number.isNaN(expMs) && expMs < now && paid + 1e-6 < total) {
        overdueBalances.push(
          listItemFromOrder(o, {
            expiredAt: new Date(exp).toISOString(),
            daysOverdue: Math.floor((now - expMs) / 86400000),
          })
        );
      }
    }

    if (hasDep && o.garmentsOrdered !== true && (o.jobCreated || ["READY", "PRODUCTION_READY", "PRINTING"].includes(st))) {
      depositPaidButNotReady.push(
        listItemFromOrder(o, {
          garmentOrderStatus: o.garmentOrderStatus,
          jobCreated: o.jobCreated,
        })
      );
    }

    if (needsBlanks(o) && !hasDep) {
      blanksNeededButNotFunded.push(
        listItemFromOrder(o, { reason: "Blanks/production path without deposit" })
      );
    }
  }

  const risk = getCashRisks({
    orders,
    quotes: quotesFlat,
  });

  const ordersAtRiskDueToCash = risk.risks
    .filter((r) => r.code === "CASH_RISK" || r.code === "COLLECT")
    .map((r) => ({
      orderId: r.orderId,
      customerName: r.customerName,
      code: r.code,
      severity: r.severity,
      detail: r.detail,
      balanceUsd: r.balanceUsd,
    }));

  const nextCashActions = risk.recommendedActions.map((a) => ({
    action: a.action,
    priority: a.priority,
    orderId: a.orderId || null,
    quoteId: a.quoteId || null,
    customerName: a.customerName || "",
    amountUsd: a.amountUsd ?? a.totalUsd ?? null,
  }));

  return {
    today: {
      paymentsReceived: Math.round(payToday * 100) / 100,
      depositsReceived: Math.round(depToday * 100) / 100,
      invoicesPaid: invPaidToday,
      invoicesPartiallyPaid: invPartialToday,
    },
    openMoney: {
      unpaidQuotes: unpaidQuotes.slice(0, 100),
      unpaidInvoices: unpaidInvoices.slice(0, 100),
      partialDeposits: partialDeposits.slice(0, 100),
      overdueBalances: overdueBalances.slice(0, 100),
    },
    productionRisk: {
      depositPaidButNotReady: depositPaidButNotReady.slice(0, 80),
      blanksNeededButNotFunded: blanksNeededButNotFunded.slice(0, 80),
      ordersAtRiskDueToCash: ordersAtRiskDueToCash.slice(0, 80),
    },
    nextCashActions,
    risk,
  };
}

/**
 * @param {Awaited<ReturnType<typeof buildCashCommandCenter>>} payload
 */
function buildOwnerBrief(payload) {
  const risk = payload.risk || { riskLevel: "LOW", risks: [], recommendedActions: [] };
  const collectable = payload.openMoney.unpaidInvoices.reduce((s, r) => s + (r.balanceUsd || 0), 0);
  const urgent = (payload.openMoney.overdueBalances || []).slice(0, 8).map((r) => ({
    orderId: r.orderId,
    customerName: r.customerName,
    balanceUsd: r.balanceUsd,
    daysOverdue: r.daysOverdue,
  }));

  const level = risk.riskLevel || "LOW";
  const headline =
    level === "CRITICAL"
      ? "Cash protection: critical — production may outrun deposits."
      : level === "HIGH"
        ? "Cash at risk — collect deposits before buying blanks."
        : level === "MEDIUM"
          ? "Follow up stale quotes and watch overdue balances."
          : "Cash posture stable — stay ahead of open balances.";

  const first = risk.recommendedActions[0];
  const safestNextMove =
    first && first.action === "COLLECT_DEPOSIT_BEFORE_BLANKS"
      ? "Collect deposit before ordering blanks or releasing vendors."
      : first && first.action === "COLLECT_OVERDUE"
        ? `Collect overdue balance for ${first.customerName || first.orderId || "open invoice"} before new spend.`
        : first && first.action === "FOLLOW_UP_QUOTE"
          ? "Follow up the oldest unpaid quotes first."
          : first && first.action === "PRIORITY_COLLECT_HIGH_VALUE"
            ? "Prioritize collection on the largest unpaid order."
            : "Review openMoney.unpaidInvoices and productionRisk before spend.";

  const top3CashActions = payload.nextCashActions.slice(0, 3);

  return {
    headline,
    cashCollectedToday: payload.today.paymentsReceived,
    cashStillCollectable: Math.round(collectable * 100) / 100,
    urgentCollections: urgent,
    safestNextMove,
    top3CashActions,
  };
}

module.exports = {
  buildCashCommandCenter,
  buildOwnerBrief,
  startEndTodayUtc,
};
