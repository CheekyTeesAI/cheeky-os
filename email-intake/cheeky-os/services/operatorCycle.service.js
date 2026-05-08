"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { buildCashCommandCenter } = require("./cashCommandCenter.service");
const { getCashRisks, depositCollected, needsBlanks, effectiveTotal } = require("./cashRiskEngine.service");
const {
  buildSalesPipelinePayload,
  getFollowups,
  loadOrdersForSales,
} = require("./salesEngineV1.service");
const { buildOperatorFollowupsBlock } = require("./revenueRecoveryEngine.service");
const { buildOperatorPricingBlock } = require("./profitEngine.service");
const { enrichActionsWithFlow, FLOW_ENGINE_META } = require("./flowEngine.service");
const { buildBigDealsOperatorBlock } = require("./revenueAccelerationEngine.service");
const { buildProgramsOperatorBlock } = require("./marketDominationEngine.service");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function queueFilePath() {
  return path.join(__dirname, "..", "..", "data", "operator-action-queue.json");
}

function readQueueFile() {
  const p = queueFilePath();
  try {
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return { updatedAt: null, items: [] };
    if (!Array.isArray(j.items)) j.items = [];
    return j;
  } catch (_) {
    return { updatedAt: null, items: [] };
  }
}

function writeQueueFile(obj) {
  const p = queueFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

/**
 * Queue operator actions for approval only — no execution (see SAFETY in runOperatorCycle).
 * @param {object[]} actions — scored actions (priority, type, title, …)
 * @param {{ cycleId?: string }} [opts]
 */
function queueOperatorActions(actions, opts = {}) {
  const cycleId = opts.cycleId || `cycle-${Date.now()}`;
  const list = Array.isArray(actions) ? actions : [];
  const store = readQueueFile();
  let added = 0;

  for (const a of list) {
    const fp = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          t: a.type,
          title: a.title,
          action: a.action,
          type: a.type,
        })
      )
      .digest("hex")
      .slice(0, 32);

    const dup = store.items.some(
      (i) =>
        i &&
        i.status === "PENDING" &&
        i.fingerprint === fp &&
        Date.now() - new Date(i.createdAt || 0).getTime() < 86400000
    );
    if (dup) continue;

    store.items.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `op-${Date.now()}-${Math.random()}`,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      cycleId,
      fingerprint: fp,
      payload: a,
    });
    added += 1;
  }

  store.updatedAt = new Date().toISOString();
  writeQueueFile(store);
  return { queued: added, cycleId, totalPending: store.items.filter((i) => i.status === "PENDING").length };
}

/**
 * @returns {Promise<object>}
 */
async function analyzeCash() {
  let cc;
  try {
    cc = await buildCashCommandCenter();
  } catch (_) {
    cc = {
      openMoney: { unpaidInvoices: [], overdueBalances: [], partialDeposits: [] },
      productionRisk: { blanksNeededButNotFunded: [] },
      nextCashActions: [],
    };
  }
  const uninvoiced = (cc.openMoney && cc.openMoney.unpaidInvoices) || [];
  const overdue = (cc.openMoney && cc.openMoney.overdueBalances) || [];
  const partial = (cc.openMoney && cc.openMoney.partialDeposits) || [];
  const depositsNeeded =
    (cc.productionRisk && cc.productionRisk.blanksNeededButNotFunded) || [];

  return {
    unpaidInvoices: uninvoiced.slice(0, 25),
    depositsNeeded: depositsNeeded.slice(0, 25),
    overdueBalances: overdue.slice(0, 25),
    partialDeposits: partial.slice(0, 15),
    nextCashHints: (cc.nextCashActions || []).slice(0, 15),
    summary: {
      unpaidCount: uninvoiced.length,
      overdueCount: overdue.length,
      depositsNeededCount: depositsNeeded.length,
    },
  };
}

/**
 * @returns {Promise<object>}
 */
async function analyzeSales() {
  const loaded = await loadOrdersForSales();
  const pipeline = await buildSalesPipelinePayload(loaded);
  const { followups } = await getFollowups(loaded);

  return {
    quotesNeedingFollowup: (pipeline.quotes && pipeline.quotes.followupNeeded) || [],
    highValueDeals: (pipeline.quotes && pipeline.quotes.highValue) || [],
    dormantCustomers: (pipeline.customers && pipeline.customers.dormantCustomers) || [],
    followups: (followups || []).slice(0, 30),
    summary: {
      followupCount: (followups || []).length,
      highValueCount: ((pipeline.quotes && pipeline.quotes.highValue) || []).length,
      dormantCount: ((pipeline.customers && pipeline.customers.dormantCustomers) || []).length,
    },
  };
}

/**
 * @returns {Promise<object>}
 */
async function analyzeProduction() {
  const prisma = getPrisma();
  const empty = {
    jobsReadyNotStarted: [],
    jobsStuck: [],
    capacityOverload: false,
    openTaskCount: 0,
  };
  if (!prisma || !prisma.task) return empty;

  try {
    const tasks = await prisma.task.findMany({
      where: { status: { not: "COMPLETED" } },
      include: { order: true },
      orderBy: { updatedAt: "asc" },
      take: 120,
    });

    const now = Date.now();
    const readyNotStarted = [];
    const stuck = [];
    const overload = tasks.length >= 45;

    for (const t of tasks) {
      const st = String(t.status || "").toUpperCase();
      const hold = t.productionHold === true;
      const ready = t.orderReady === true;
      const blocked = String(t.releaseStatus || "").toUpperCase() === "BLOCKED";

      if (ready && (hold || blocked) && st !== "COMPLETED") {
        readyNotStarted.push({
          taskId: t.id,
          orderId: t.orderId,
          title: t.title,
          status: t.status,
          orderName: t.order ? t.order.customerName : "",
        });
      }

      const due = t.dueDate ? new Date(t.dueDate).getTime() : 0;
      const idle = now - new Date(t.updatedAt).getTime();
      if ((due > 0 && due < now) || idle > 5 * 86400000) {
        stuck.push({
          taskId: t.id,
          orderId: t.orderId,
          title: t.title,
          status: t.status,
          daysIdle: Math.floor(idle / 86400000),
          duePassed: due > 0 && due < now,
        });
      }
    }

    return {
      jobsReadyNotStarted: readyNotStarted.slice(0, 25),
      jobsStuck: stuck.slice(0, 25),
      capacityOverload: overload,
      openTaskCount: tasks.length,
    };
  } catch (_) {
    return empty;
  }
}

/**
 * @returns {Promise<object>}
 */
async function analyzeRisks() {
  const { orders } = await loadOrdersForSales();
  const quotesFlat = [];
  for (const o of orders) {
    for (const q of o.quotes || []) {
      quotesFlat.push({ ...q, order: o });
    }
  }
  const pack = getCashRisks({ orders, quotes: quotesFlat });

  const depositGaps = orders.filter((o) => {
    if (o.deletedAt) return false;
    return !depositCollected(o) && !["CANCELLED", "COMPLETED", "PAID_IN_FULL"].includes(String(o.status || "").toUpperCase());
  }).length;

  const blanksBlock = orders.filter((o) => needsBlanks(o) && !depositCollected(o)).length;

  let overdueDeadlines = 0;
  for (const o of orders) {
    if (o.deletedAt) continue;
    const exp = o.invoiceExpiresAt || o.quoteExpiresAt;
    if (!exp) continue;
    const expMs = new Date(exp).getTime();
    const paid = Number(o.amountPaid || 0);
    if (!Number.isNaN(expMs) && expMs < Date.now() && paid + 1e-6 < effectiveTotal(o)) {
      overdueDeadlines += 1;
    }
  }

  return {
    riskLevel: pack.riskLevel,
    engineRisks: pack.risks.slice(0, 40),
    summary: {
      depositGaps,
      blanksBlock,
      overdueDeadlines,
      riskCount: pack.risks.length,
    },
  };
}

/**
 * @param {number} balanceUsd
 * @param {number} days
 */
function urgencyFromOverdue(balanceUsd, days) {
  return Math.min(120, days * 8) + Math.min(80, balanceUsd / 50);
}

/**
 * @param {object} input
 * @param {Awaited<ReturnType<typeof analyzeCash>>} input.cash
 * @param {Awaited<ReturnType<typeof analyzeSales>>} input.sales
 * @param {Awaited<ReturnType<typeof analyzeProduction>>} input.production
 * @param {Awaited<ReturnType<typeof analyzeRisks>>} input.risks
 */
function generateActions(input) {
  const { cash, sales, production, risks } = input;
  /** @type {object[]} */
  const candidates = [];

  for (const row of cash.overdueBalances || []) {
    const bal = Number(row.balanceUsd || 0);
    const days = Number(row.daysOverdue || 0);
    candidates.push({
      type: "CASH",
      title: `Collect overdue balance: ${row.customerName || row.orderId}`,
      reason: `${row.customerName || "Customer"} — $${bal.toFixed(2)} overdue (${days}d)`,
      impact: bal >= 1000 || days >= 14 ? "HIGH" : days >= 7 ? "MEDIUM" : "LOW",
      effort: "LOW",
      action: `Operator: send payment link or call; do not release production until collected or approved exception.`,
      _cashWeight: Math.min(200, bal / 25 + urgencyFromOverdue(bal, days)),
      _urgencyScore: urgencyFromOverdue(bal, days),
      _revenueScore: Math.min(60, bal / 100),
    });
  }

  for (const row of cash.depositsNeeded || []) {
    candidates.push({
      type: "CASH",
      title: `Deposit before blanks: ${row.customerName || row.orderId}`,
      reason: (row.reason || "Blanks/production path without deposit") + ` — $${Number(row.balanceUsd || 0).toFixed(2)} open`,
      impact: "HIGH",
      effort: "LOW",
      action: `Operator: collect deposit or pause vendor/blank purchase until cash clears (no auto-order).`,
      _cashWeight: 120,
      _urgencyScore: 40,
      _revenueScore: Math.min(50, Number(row.totalUsd || 0) / 120),
    });
  }

  for (const row of (cash.partialDeposits || []).slice(0, 8)) {
    const bal = Number(row.balanceUsd || 0);
    if (bal < 50) continue;
    candidates.push({
      type: "CASH",
      title: `Balance after deposit: ${row.customerName || row.orderId}`,
      reason: `Partial paid; $${bal.toFixed(2)} remaining`,
      impact: bal >= 500 ? "MEDIUM" : "LOW",
      effort: "LOW",
      action: `Operator: confirm scope and request remaining balance before final production push.`,
      _cashWeight: 70,
      _urgencyScore: 20,
      _revenueScore: Math.min(40, bal / 150),
    });
  }

  for (const f of (sales.followups || []).slice(0, 8)) {
    const urg = String(f.urgency || "").toUpperCase();
    candidates.push({
      type: "SALES",
      title: `Follow up quote: ${f.customer}`,
      reason: f.reason || "Quote aging",
      impact: urg === "URGENT" ? "HIGH" : urg === "HIGH" ? "MEDIUM" : "LOW",
      effort: "LOW",
      action: `Operator: draft follow-up only (use comms approvals); do not auto-send.`,
      _cashWeight: urg === "URGENT" ? 55 : 35,
      _urgencyScore: urg === "URGENT" ? 50 : urg === "HIGH" ? 35 : 15,
      _revenueScore: 25,
    });
  }

  for (const d of (sales.highValueDeals || []).slice(0, 5)) {
    candidates.push({
      type: "SALES",
      title: `High-value quote: ${d.customer}`,
      reason: `$${Number(d.totalUsd || 0).toFixed(2)} — move toward deposit`,
      impact: "HIGH",
      effort: "MEDIUM",
      action: `Operator: priority touch to unblock deposit; keep production gates enforced.`,
      _cashWeight: 40,
      _urgencyScore: 25,
      _revenueScore: Math.min(80, Number(d.totalUsd || 0) / 80),
    });
  }

  for (const d of (sales.dormantCustomers || []).slice(0, 3)) {
    candidates.push({
      type: "SALES",
      title: `Reactivate: ${d.customerName || d.email}`,
      reason: `Dormant ~${d.lastActivityDays || "?"}d`,
      impact: "LOW",
      effort: "LOW",
      action: `Operator: light check-in draft only if pipeline needs volume.`,
      _cashWeight: 15,
      _urgencyScore: 5,
      _revenueScore: 15,
    });
  }

  for (const j of production.jobsReadyNotStarted || []) {
    candidates.push({
      type: "PRODUCTION",
      title: `Release hold: ${j.title}`,
      reason: `Order ${j.orderName || j.orderId} — ready flag with hold/block`,
      impact: "MEDIUM",
      effort: "MEDIUM",
      action: `Operator: verify deposit/art gates, then clear hold manually in ops (no auto stage moves).`,
      _cashWeight: 25,
      _urgencyScore: 30,
      _revenueScore: 10,
    });
  }

  for (const j of (production.jobsStuck || []).slice(0, 6)) {
    if (!j.duePassed && (j.daysIdle || 0) < 3) continue;
    candidates.push({
      type: "PRODUCTION",
      title: `Unblock task: ${j.title}`,
      reason: j.duePassed ? "Past due date" : `Idle ${j.daysIdle || 0}d`,
      impact: j.duePassed ? "HIGH" : "MEDIUM",
      effort: "MEDIUM",
      action: `Operator: diagnose block (blanks, art, cash); assign owner; no autonomous routing.`,
      _cashWeight: 20,
      _urgencyScore: j.duePassed ? 45 : 25,
      _revenueScore: 10,
    });
  }

  if (production.capacityOverload) {
    candidates.push({
      type: "PRODUCTION",
      title: "Capacity review",
      reason: `Open tasks ~${production.openTaskCount} — overload risk`,
      impact: "MEDIUM",
      effort: "HIGH",
      action: `Operator: triage queue, defer non-cash tasks, align with runway (manual).`,
      _cashWeight: 30,
      _urgencyScore: 35,
      _revenueScore: 5,
    });
  }

  if (risks.summary && risks.summary.blanksBlock > 0) {
    candidates.push({
      type: "CASH",
      title: "Cash vs blanks risk cluster",
      reason: `${risks.summary.blanksBlock} orders may need blanks without deposit coverage`,
      impact: risks.riskLevel === "CRITICAL" ? "HIGH" : "MEDIUM",
      effort: "LOW",
      action: `Operator: align with Cash Command Center; block blank spends until deposits.`,
      _cashWeight: 90,
      _urgencyScore: risks.riskLevel === "CRITICAL" ? 55 : 35,
      _revenueScore: 20,
    });
  }

  function effortMult(e) {
    if (e === "LOW") return 1.15;
    if (e === "MEDIUM") return 1.0;
    return 0.9;
  }

  function impactMult(i) {
    if (i === "HIGH") return 1.35;
    if (i === "MEDIUM") return 1.1;
    return 1.0;
  }

  for (const c of candidates) {
    const typeWeight = c.type === "CASH" ? 1.25 : c.type === "SALES" ? 1.05 : 1.0;
    c._score =
      (Number(c._cashWeight || 0) * 1.4 + Number(c._urgencyScore || 0) + Number(c._revenueScore || 0)) *
      typeWeight *
      effortMult(c.effort) *
      impactMult(c.impact);
  }

  candidates.sort((a, b) => (b._score || 0) - (a._score || 0));

  const top = candidates.slice(0, 7);
  if (!top.length) {
    top.push({
      type: "SALES",
      title: "Pipeline hygiene",
      reason: "No urgent rows detected — keep funnel warm",
      impact: "LOW",
      effort: "LOW",
      action: `Operator: open /api/sales/pipeline and confirm next best follow-ups manually.`,
      priority: 1,
    });
    return top;
  }

  return top.map((c, idx) => {
    const { _score, _cashWeight, _urgencyScore, _revenueScore, ...rest } = c;
    return { ...rest, priority: idx + 1 };
  });
}

/**
 * SAFETY: This function does not send messages, order blanks, or move production stages.
 * It only analyzes, ranks, and writes approval-queue rows.
 *
 * @param {{ queue?: boolean }} [options]
 */
async function runOperatorCycle(options = {}) {
  const queue = options.queue !== false;

  const [cash, sales, production, risks] = await Promise.all([
    analyzeCash(),
    analyzeSales(),
    analyzeProduction(),
    analyzeRisks(),
  ]);

  const actionsRaw = generateActions({ cash, sales, production, risks });
  let actions = actionsRaw;
  try {
    actions = await enrichActionsWithFlow(actionsRaw);
  } catch (flowErr) {
    console.error("[operator-cycle] flow:", flowErr && flowErr.message ? flowErr.message : flowErr);
    actions = actionsRaw;
  }
  let queueResult = { queued: 0, cycleId: null, totalPending: 0 };
  if (queue && actions.length) {
    queueResult = queueOperatorActions(actions, { cycleId: options.cycleId });
  }

  let followups = { required: [], readyToSend: [], estimatedCashRecovery: 0 };
  try {
    followups = await buildOperatorFollowupsBlock();
  } catch (fuErr) {
    console.error("[operator-cycle] followups:", fuErr && fuErr.message ? fuErr.message : fuErr);
  }

  let pricing = { dealsEvaluated: [], riskyDeals: [], priceAdjustments: [] };
  try {
    pricing = await buildOperatorPricingBlock();
  } catch (prErr) {
    console.error("[operator-cycle] pricing:", prErr && prErr.message ? prErr.message : prErr);
  }

  let bigDeals = { mustClose: [], followups: [], estimatedRevenue: 0 };
  try {
    bigDeals = await buildBigDealsOperatorBlock();
  } catch (bdErr) {
    console.error("[operator-cycle] big-deals:", bdErr && bdErr.message ? bdErr.message : bdErr);
  }

  let programs = { clientsToConvert: [], outreachNeeded: [], expectedRevenue: 0 };
  try {
    programs = await buildProgramsOperatorBlock();
  } catch (pgErr) {
    console.error("[operator-cycle] programs:", pgErr && pgErr.message ? pgErr.message : pgErr);
  }

  return {
    cash,
    sales,
    production,
    risks,
    actions,
    flowEngine: FLOW_ENGINE_META,
    bigDeals,
    programs,
    queue: queueResult,
    followups,
    pricing,
    safety: {
      noAutoExecution: true,
      noAutoSend: true,
      noAutoBlanks: true,
      noAutoStageMove: true,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * @param {Awaited<ReturnType<typeof runOperatorCycle>>} cycle
 */
function buildOperatorDailyBriefFromCycle(cycle) {
  const actions = cycle.actions || [];
  const level = (cycle.risks && cycle.risks.riskLevel) || "LOW";
  const headline =
    level === "CRITICAL"
      ? "Critical cash/production tension — clear deposits before spend."
      : level === "HIGH"
        ? "High cash risk — protect runway and prioritize collections."
        : "Operational rhythm: revenue and production need light steering.";

  const top3Actions = actions.slice(0, 3).map((a) => ({
    priority: a.priority,
    type: a.type,
    title: a.title,
    action: a.action,
  }));

  const r0 = (cycle.risks && cycle.risks.engineRisks && cycle.risks.engineRisks[0]) || null;
  const biggestRisk = r0
    ? `${r0.code || "RISK"}: ${r0.detail || r0.rule || "review risks"}`
    : cycle.risks && cycle.risks.summary && cycle.risks.summary.depositGaps
      ? `${cycle.risks.summary.depositGaps} orders lack deposit coverage`
      : "No acute engine risk — still validate cash gates manually.";

  const easy = actions.find((a) => a.effort === "LOW" && (a.impact === "HIGH" || a.impact === "MEDIUM"));
  const easiestWin = easy
    ? `${easy.title} (${easy.type})`
    : actions[0]
      ? actions[0].title
      : "Review pipeline for fastest revenue touch.";

  const cashFocus =
    (cycle.cash && cycle.cash.summary && cycle.cash.summary.overdueCount > 0)
      ? `Collect ${cycle.cash.summary.overdueCount} overdue buckets first.`
      : (cycle.cash && cycle.cash.summary && cycle.cash.summary.depositsNeededCount > 0)
        ? `Secure deposits on ${cycle.cash.summary.depositsNeededCount} at-risk production paths.`
        : "Cash posture steady — keep follow-ups converting to deposits.";

  const productionFocus = cycle.production && cycle.production.capacityOverload
    ? `Task load ${cycle.production.openTaskCount}+ — triage before taking new promise dates.`
    : (cycle.production && (cycle.production.jobsStuck || []).length > 0)
      ? `${(cycle.production.jobsStuck || []).length} tasks look stuck or past due — assign owners.`
      : (cycle.production && (cycle.production.jobsReadyNotStarted || []).length > 0)
        ? `${(cycle.production.jobsReadyNotStarted || []).length} ready jobs still held — verify gates then release manually.`
        : "Production queue manageable — protect cash-order sequence.";

  return {
    headline,
    top3Actions,
    biggestRisk,
    easiestWin,
    cashFocus,
    productionFocus,
  };
}

async function buildOperatorDailyBrief() {
  const cycle = await runOperatorCycle({ queue: false });
  const brief = buildOperatorDailyBriefFromCycle(cycle);
  return { ...brief, generatedAt: new Date().toISOString() };
}

module.exports = {
  runOperatorCycle,
  analyzeCash,
  analyzeSales,
  analyzeProduction,
  analyzeRisks,
  generateActions,
  queueOperatorActions,
  buildOperatorDailyBrief,
  buildOperatorDailyBriefFromCycle,
};
