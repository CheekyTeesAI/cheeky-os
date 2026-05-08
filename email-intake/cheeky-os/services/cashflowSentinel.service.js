"use strict";

/**
 * Cashflow Sentinel — advisory snapshot only. Amounts in cents.
 */

const store = require("./cashflow.store");

function fmtUsd(cents) {
  const n = Math.round(Number(cents || 0));
  return (n / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Income events in [today, today+7] NY calendar.
 */
function incomeIn7d(events, todayYmd) {
  let s = 0;
  for (const e of events || []) {
    if (String(e.type || "").toUpperCase() !== "EXPECTED_INCOME") continue;
    if (["RECEIVED", "CANCELLED", "DEFERRED"].includes(String(e.status || "").toUpperCase())) continue;
    const ed = String(e.expectedDate || "").slice(0, 10);
    const d0 = store.daysFromYmd(todayYmd, ed);
    if (d0 == null) continue;
    if (d0 >= 0 && d0 <= 7) s += Math.round(Number(e.amount || 0));
  }
  return s;
}

function obligationsInWindow(obligations, todayYmd, maxDays) {
  let total = 0;
  const detail = [];
  for (const o of obligations || []) {
    const st = String(o.status || "").toUpperCase();
    if (st === "PAID" || st === "DEFERRED") continue;
    const due = String(o.dueDate || "").slice(0, 10);
    const diff = store.daysFromYmd(todayYmd, due);
    if (diff == null) continue;
    if (diff >= 0 && diff <= maxDays) {
      const amt = Math.round(Number(o.amount || 0));
      total += amt;
      detail.push({
        id: o.id,
        name: o.name,
        vendor: o.vendor,
        category: o.category,
        dueDate: due,
        amountCents: amt,
        amountUsd: fmtUsd(amt),
        priority: o.priority,
        derivedStatus: o.derivedStatus || st,
      });
    }
  }
  return { total, detail };
}

function debtMinimumsInWindow(debts, todayYmd, maxDays) {
  let total = 0;
  const detail = [];
  for (const d of debts || []) {
    const st = String(d.status || "").toUpperCase();
    if (st === "PAID") continue;
    const due = String(d.dueDate || "").slice(0, 10);
    if (!due || due.length < 8) continue;
    const diff = store.daysFromYmd(todayYmd, due);
    if (diff == null) continue;
    if (diff >= 0 && diff <= maxDays) {
      const amt = Math.round(Number(d.minimumPayment || 0));
      total += amt;
      detail.push({
        id: d.id,
        name: d.name,
        lender: d.lender,
        dueDate: due,
        minimumPaymentCents: amt,
        minimumPaymentUsd: fmtUsd(amt),
        balanceCents: Math.round(Number(d.balance || 0)),
      });
    }
  }
  return { total, detail };
}

function debMinIn7(debts, todayYmd) {
  return debtMinimumsInWindow(debts, todayYmd, 7).total;
}

function overdueItems(obligations, todayYmd) {
  const list = [];
  let total = 0;
  for (const o of obligations || []) {
    const st = String(o.status || "").toUpperCase();
    if (st === "PAID" || st === "DEFERRED") continue;
    const due = String(o.dueDate || "").slice(0, 10);
    const diff = store.daysFromYmd(todayYmd, due);
    if (diff == null) continue;
    if (diff < 0) {
      const amt = Math.round(Number(o.amount || 0));
      total += amt;
      list.push({
        id: o.id,
        name: o.name,
        vendor: o.vendor,
        category: o.category,
        dueDate: due,
        daysPast: -diff,
        amountCents: amt,
        amountUsd: fmtUsd(amt),
        priority: o.priority,
        derivedStatus: "OVERDUE",
      });
    }
  }
  return { total, list };
}

function billsDueToday(obligations, todayYmd) {
  return obligations.filter((o) => {
    const st = String(o.status || "").toUpperCase();
    if (st === "PAID" || st === "DEFERRED") return false;
    const due = String(o.dueDate || "").slice(0, 10);
    return due === todayYmd;
  });
}

function criticalDueSoon(obligations, todayYmd) {
  return obligations.filter((o) => {
    const st = String(o.status || "").toUpperCase();
    if (st === "PAID" || st === "DEFERRED") return false;
    if (String(o.priority || "").toUpperCase() !== "CRITICAL") return false;
    const due = String(o.dueDate || "").slice(0, 10);
    const diff = store.daysFromYmd(todayYmd, due);
    return diff != null && diff >= 0 && diff <= 3;
  });
}

function buildCashflowSnapshot() {
  const raw = store.listAll();
  const todayYmd = store.nyYmd(new Date());
  const obligations = store.listObligationsWithDerived();

  const warnings = [];
  const accounts = raw.cashAccounts || [];
  const cashOnHand = accounts.reduce((a, x) => a + Math.round(Number(x.currentBalance || 0)), 0);
  if (!accounts.length) {
    warnings.push("cash_on_hand_unknown_no_accounts — add cash accounts in /cashflow.html");
  }

  const expectedIncome7d = incomeIn7d(raw.events || [], todayYmd);

  const o7 = obligationsInWindow(obligations, todayYmd, 7);
  const o14 = obligationsInWindow(obligations, todayYmd, 14);
  const d14 = debtMinimumsInWindow(raw.debts || [], todayYmd, 14);
  const obligations7d = o7.total + debMinIn7(raw.debts || [], todayYmd);
  const obligations14d = o14.total + d14.total;

  const od = overdueItems(obligations, todayYmd);
  const overdueTotal = od.total;

  const rawSafe = cashOnHand + expectedIncome7d - obligations14d;
  const safeToSpend = Math.max(0, rawSafe);
  const shortfallCents = rawSafe < 0 ? -rawSafe : 0;

  /** @type {string[]} */
  const risks = [];
  if (criticalDueSoon(obligations, todayYmd).length) {
    risks.push("Critical bills due soon");
  }
  if (overdueTotal > 0) {
    risks.push(`Overdue obligations need action — ${fmtUsd(overdueTotal)}`);
  }
  if (rawSafe < 0) {
    risks.push(`Safe-to-spend is negative (display capped at ${fmtUsd(0)}) — shortfall ${fmtUsd(shortfallCents)}`);
  }
  if (expectedIncome7d < obligations14d - cashOnHand && obligations14d > 0 && cashOnHand + expectedIncome7d < obligations14d) {
    risks.push("Expected income (7d) is not enough to cover 14-day obligations vs cash on hand");
  }

  /** @type {string[]} */
  const nextActions = [];
  if (od.list.length) {
    nextActions.push(`Pay or re-schedule ${od.list.length} overdue bill(s) — ${fmtUsd(overdueTotal)}`);
  }
  nextActions.push("Review cashflow sentinel (/cashflow.html)");
  if (cashOnHand < obligations7d && obligations7d > 0) {
    nextActions.push("Collect deposits before spending — obligations inside 7 days exceed cash on hand");
  }
  if (rawSafe < 0) {
    nextActions.push("Delay non-critical spending until runway improves");
  }
  const taxSoon = o7.detail.filter((x) => String(x.category || "").toUpperCase() === "TAX");
  if (taxSoon.length) {
    nextActions.push(`Protect funds for ${taxSoon.length} tax/class treasury item(s) this week`);
  }

  /** Purchasing advisory — does not alter obligation totals (avoid double-count). */
  let purchasingAdvisory = null;
  try {
    const pStore = require("./purchasing.store");
    const pPlans = pStore.listPlans();
    let approvedCommitCents = 0;
    let blockedDeposit = 0;
    let ordNotRec = 0;
    let needsAppr = 0;
    for (const p of pPlans) {
      const ps = String(p.status || "").toUpperCase();
      if (ps === "APPROVED") approvedCommitCents += Math.round(Number(p.totalCost || 0));
      if (ps === "BLOCKED" && String(p.blockedReason || "").includes("insufficient_deposit")) blockedDeposit += 1;
      if (ps === "ORDERED" || ps === "PARTIALLY_RECEIVED") ordNotRec += 1;
      if (ps === "NEEDS_APPROVAL" || ps === "DRAFT") needsAppr += 1;
    }
    if (needsAppr > 0) {
      risks.push(`${needsAppr} purchase plan(s) awaiting approval — /purchasing.html`);
    }
    if (blockedDeposit > 0) {
      risks.push(`${blockedDeposit} blank purchase plan(s) blocked (deposit vs estimated blank cost)`);
    }
    if (ordNotRec > 0) {
      risks.push(`${ordNotRec} vendor blank order(s) not marked received`);
    }
    purchasingAdvisory = {
      approvedBlankCommitmentsCents: approvedCommitCents,
      approvedBlankCommitmentsUsd: fmtUsd(approvedCommitCents),
      plansAwaitingApproval: needsAppr,
      blockedByDepositGate: blockedDeposit,
      orderedNotReceivedCount: ordNotRec,
      note: "Advisory only — not added to obligations7d/14d to avoid double-count with manual cashflow entries",
    };
  } catch (_pu) {
    purchasingAdvisory = null;
  }

  const upcoming = o14.detail
    .concat(
      d14.detail.map((x) => ({
        id: x.id,
        name: x.name + " (min pmt)",
        vendor: x.lender,
        category: "DEBT_MIN",
        dueDate: x.dueDate,
        amountCents: x.minimumPaymentCents,
        amountUsd: x.minimumPaymentUsd,
        priority: "HIGH",
        derivedStatus: "DEBT_MIN",
      }))
    )
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  return {
    ok: true,
    cashOnHand,
    cashOnHandUsd: fmtUsd(cashOnHand),
    expectedIncome7d,
    expectedIncome7dUsd: fmtUsd(expectedIncome7d),
    obligations7d,
    obligations7dUsd: fmtUsd(obligations7d),
    obligations14d,
    obligations14dUsd: fmtUsd(obligations14d),
    overdueTotal,
    overdueTotalUsd: fmtUsd(overdueTotal),
    safeToSpend,
    safeToSpendUsd: fmtUsd(safeToSpend),
    safeToSpendRawCents: rawSafe,
    shortfallCents,
    shortfallUsd: shortfallCents ? fmtUsd(shortfallCents) : fmtUsd(0),
    risks,
    nextActions,
    upcoming: upcoming.slice(0, 40),
    overdue: od.list.slice(0, 30),
    billsDueToday: billsDueToday(obligations, todayYmd).map((o) => ({
      id: o.id,
      name: o.name,
      vendor: o.vendor,
      amountCents: Math.round(Number(o.amount || 0)),
      amountUsd: fmtUsd(o.amount || 0),
      priority: o.priority,
    })),
    billsDue7d: o7.detail,
    overdueObligations: od.list,
    debtWatch: (raw.debts || []).slice(0, 20).map((d) => ({
      id: d.id,
      name: d.name,
      lender: d.lender,
      balanceCents: Math.round(Number(d.balance || 0)),
      balanceUsd: fmtUsd(d.balance || 0),
      minimumPaymentUsd: fmtUsd(d.minimumPayment || 0),
      dueDate: d.dueDate,
    })),
    expectedIncomeEvents: (raw.events || [])
      .filter((e) => String(e.type || "").toUpperCase() === "EXPECTED_INCOME")
      .slice(0, 15),
    recommendedMoneyMoves: nextActions.slice(0, 8),
    purchasingAdvisory,
    warnings: warnings.length ? warnings : undefined,
    timestamp: new Date().toISOString(),
    dateNY: todayYmd,
  };
}

module.exports = {
  buildCashflowSnapshot,
  fmtUsd,
};
