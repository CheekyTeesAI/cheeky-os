"use strict";

const prisma = require("../prisma");
const { classifyMoneySignal, getCashMode } = require("./cashPolicy");
const { getUpcomingObligations } = require("./obligationsTracker");

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function scoreDataQuality(missing) {
  const totalSignals = 12;
  const missingCount = Array.isArray(missing) ? missing.length : 0;
  return Math.max(0, Math.min(1, Number(((totalSignals - missingCount) / totalSignals).toFixed(2))));
}

async function getCashSnapshot() {
  const now = new Date();
  const dayStart = startOfDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const missingSignals = [];

  let paidToday = classifyMoneySignal(null, "unknown");
  let paidLast7Days = classifyMoneySignal(null, "unknown");
  let unpaidDeposits = { value: null, count: 0, certainty: "unknown" };
  let outstandingInvoiceValue = classifyMoneySignal(null, "unknown");
  let outstandingQuoteValue = classifyMoneySignal(null, "unknown");
  let vendorExposure = classifyMoneySignal(null, "unknown");

  try {
    const orders = await prisma.order.findMany({
      select: {
        id: true,
        status: true,
        amountTotal: true,
        amountPaid: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    let paidTodayValue = 0;
    let paid7Value = 0;
    let unpaidDepositValue = 0;
    let unpaidDepositCount = 0;
    let outstandingInvoice = 0;
    let outstandingQuote = 0;

    for (const o of orders) {
      const amountPaid = Number(o.amountPaid || 0);
      const amountTotal = Number(o.amountTotal || 0);
      const status = String(o.status || "").toUpperCase();
      const updatedAt = o.updatedAt ? new Date(o.updatedAt) : null;

      if (updatedAt && updatedAt >= dayStart) paidTodayValue += amountPaid;
      if (updatedAt && updatedAt >= sevenDaysAgo) paid7Value += amountPaid;

      if (status === "DEPOSIT_PENDING") {
        unpaidDepositValue += Math.max(0, amountTotal - amountPaid);
        unpaidDepositCount += 1;
      }
      if (status.includes("QUOTE")) {
        outstandingQuote += Math.max(0, amountTotal - amountPaid);
      }
      if (status.includes("INVOICE") || status === "DEPOSIT_PAID" || status === "PAID_IN_FULL") {
        outstandingInvoice += Math.max(0, amountTotal - amountPaid);
      }
    }

    paidToday = classifyMoneySignal(paidTodayValue, "actual");
    paidLast7Days = classifyMoneySignal(paid7Value, "actual");
    unpaidDeposits = {
      value: Number(unpaidDepositValue.toFixed(2)),
      count: unpaidDepositCount,
      certainty: "actual",
    };
    outstandingInvoiceValue = classifyMoneySignal(Number(outstandingInvoice.toFixed(2)), "estimated");
    outstandingQuoteValue = classifyMoneySignal(Number(outstandingQuote.toFixed(2)), "estimated");
  } catch (_) {
    missingSignals.push("orders");
  }

  let known7 = { value: 0, count: 0, certainty: "unknown" };
  let known30 = { value: 0, count: 0, certainty: "unknown" };
  let payrollEstimate = classifyMoneySignal(null, "unknown");
  let taxExposure = classifyMoneySignal(null, "unknown");
  let loanExposure = classifyMoneySignal(null, "unknown");
  try {
    const obligations = getUpcomingObligations();
    const next7 = obligations.filter((o) => o.daysUntilDue !== null && o.daysUntilDue <= 7 && o.daysUntilDue >= 0);
    const next30 = obligations.filter((o) => o.daysUntilDue !== null && o.daysUntilDue <= 30 && o.daysUntilDue >= 0);
    const certainty = obligations.length ? "estimated" : "unknown";

    known7 = {
      value: Number(next7.reduce((sum, o) => sum + Number(o.amount || 0), 0).toFixed(2)),
      count: next7.length,
      certainty,
    };
    known30 = {
      value: Number(next30.reduce((sum, o) => sum + Number(o.amount || 0), 0).toFixed(2)),
      count: next30.length,
      certainty,
    };

    const payroll = obligations.filter((o) => o.type === "payroll").reduce((s, o) => s + Number(o.amount || 0), 0);
    const tax = obligations.filter((o) => o.type === "tax").reduce((s, o) => s + Number(o.amount || 0), 0);
    const loan = obligations.filter((o) => o.type === "loan").reduce((s, o) => s + Number(o.amount || 0), 0);
    payrollEstimate = classifyMoneySignal(payroll || null, payroll ? "estimated" : "unknown");
    taxExposure = classifyMoneySignal(tax || null, tax ? "estimated" : "unknown");
    loanExposure = classifyMoneySignal(loan || null, loan ? "estimated" : "unknown");
  } catch (_) {
    missingSignals.push("known_obligations");
  }

  try {
    const tasks = await prisma.task.findMany({
      where: { releaseStatus: { not: "READY" } },
      select: { id: true },
    });
    vendorExposure = classifyMoneySignal(tasks.length * 250, tasks.length ? "estimated" : "unknown");
  } catch (_) {
    missingSignals.push("vendor_exposure");
  }

  const cashOnHand = classifyMoneySignal(null, "unknown");
  const usableCashProxy =
    paidLast7Days.value !== null
      ? classifyMoneySignal(Number((paidLast7Days.value / 2).toFixed(2)), "estimated")
      : classifyMoneySignal(null, "unknown");
  if (cashOnHand.value === null) missingSignals.push("cash_on_hand");

  return {
    timestamp: now.toISOString(),
    mode: getCashMode(),
    inflows: {
      paidToday,
      paidLast7Days,
      unpaidDeposits,
      outstandingInvoiceValue,
      outstandingQuoteValue,
    },
    outflows: {
      knownObligationsNext7Days: known7,
      knownObligationsNext30Days: known30,
      vendorExposure,
      payrollEstimate,
      taxExposure,
      loanExposure,
    },
    liquidity: {
      cashOnHand: { value: cashOnHand.value, certainty: cashOnHand.certainty },
      usableCashProxy: { value: usableCashProxy.value, certainty: usableCashProxy.certainty },
    },
    dataQuality: {
      score: scoreDataQuality(missingSignals),
      missingSignals,
    },
  };
}

module.exports = {
  getCashSnapshot,
};
