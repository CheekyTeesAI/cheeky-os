"use strict";

/**
 * Owner Command Center — aggregates existing subsystems (partial-safe, no payment changes).
 */

const path = require("path");
const { computeStuckReasons } = require(path.join(__dirname, "operatorStuckReasons"));

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function attachDigestStatus(signals) {
  try {
    const digStore = require(path.join(__dirname, "dailyDigests.store"));
    const key = digStore.digestDateKeyNY();
    const e = digStore.getByDigestDate(key);
    signals.digestStatus = {
      generatedToday: !!e,
      lastGeneratedAt: e ? e.createdAt : null,
      topPriorityCount: e ? Number(e.topPriorityCount || 0) : 0,
      riskCount: e ? Number(e.riskCount || 0) : 0,
    };
  } catch (_e) {
    signals.digestStatus = {
      generatedToday: false,
      lastGeneratedAt: null,
      topPriorityCount: 0,
      riskCount: 0,
    };
  }

  try {
    const { buildCashflowSnapshot } = require(path.join(__dirname, "cashflowSentinel.service"));
    const s = buildCashflowSnapshot();
    signals.cashflow = {
      cashOnHand: s.cashOnHand,
      expectedIncome7d: s.expectedIncome7d,
      obligations7d: s.obligations7d,
      obligations14d: s.obligations14d,
      overdueTotal: s.overdueTotal,
      safeToSpend: s.safeToSpend,
      safeToSpendRawCents: s.safeToSpendRawCents,
      shortfallCents: s.shortfallCents || 0,
      riskCount: Array.isArray(s.risks) ? s.risks.length : 0,
    };
  } catch (_c) {
    signals.cashflow = {
      cashOnHand: 0,
      expectedIncome7d: 0,
      obligations7d: 0,
      obligations14d: 0,
      overdueTotal: 0,
      safeToSpend: 0,
      safeToSpendRawCents: 0,
      shortfallCents: 0,
      riskCount: 0,
    };
  }

  try {
    const { ownerPurchasingSnapshot } = require(path.join(__dirname, "purchasingEngine.service"));
    signals.purchasing = ownerPurchasingSnapshot();
  } catch (_p) {
    signals.purchasing = {
      needsApproval: 0,
      blocked: 0,
      orderedNotReceived: 0,
      estimatedSpendPending: 0,
    };
  }

  try {
    const { ownerQcSnapshot } = require(path.join(__dirname, "qcEngine.service"));
    signals.qcQuality = ownerQcSnapshot();
  } catch (_q) {
    signals.qcQuality = { pending: 0, failed: 0, reprints: 0 };
  }
  return signals;
}

/**
 * @returns {Promise<object>}
 */
async function collectOwnerSignals() {
  const prisma = getPrisma();
  const signals = {
    database: "unavailable",
    depositPaidToday: 0,
    stuckWithoutDeposit: 0,
    ordersAwaitingDeposit: 0,
    balanceDue: 0,
    ready: 0,
    printing: 0,
    qc: 0,
    completed: 0,
    stuck: 0,
    missingNextAction: 0,
    pickupGapN: 0,
    artChangesN: 0,
    commsNeedsApproval: 0,
    commsApproved: 0,
    commsErrors: 0,
    salesOpen: 0,
    salesHigh: 0,
    salesPipeline: 0,
    salesDraftsWaiting: 0,
    jeremyAssigned: 0,
    jeremyActiveClock: false,
    jeremyHoursToday: 0,
    selfFixDisabled: false,
    squareWebhookSkipVerify: false,
    fulfillment: { pickupReady: 0, shippingStaged: 0, needsReview: 0, completedToday: 0 },
    digestStatus: {
      generatedToday: false,
      lastGeneratedAt: null,
      topPriorityCount: 0,
      riskCount: 0,
    },
    cashflow: {
      cashOnHand: 0,
      expectedIncome7d: 0,
      obligations7d: 0,
      obligations14d: 0,
      overdueTotal: 0,
      safeToSpend: 0,
      safeToSpendRawCents: 0,
      shortfallCents: 0,
      riskCount: 0,
    },
    warnings: /** @type {string[]} */ ([]),
  };

  const jName = String(process.env.CHEEKY_JEREMY_NAME || "Jeremy").trim() || "Jeremy";
  const jLower = jName.toLowerCase();

  try {
    const selfFixSvc = require(path.join(__dirname, "selfFixService"));
    if (selfFixSvc && selfFixSvc.SELF_FIX_ENABLED === false) signals.selfFixDisabled = true;
  } catch (_e) {
    signals.warnings.push("self_fix_module_unavailable");
  }

  if (String(process.env.SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY || "").toLowerCase() === "true") {
    signals.squareWebhookSkipVerify = true;
  }

  try {
    const tc = require(path.join(__dirname, "timeClock.store"));
    const st = tc.getStatus(jName);
    signals.jeremyActiveClock = !!(st && st.active);
    const td = tc.getTodaySummary(jName);
    signals.jeremyHoursToday = Math.round((Number(td.totalMinutes || 0) / 60) * 100) / 100;
  } catch (_e) {
    signals.warnings.push("time_clock_read_failed");
  }

  if (!prisma || !prisma.order) {
    signals.warnings.push("database_unavailable");
    return attachDigestStatus(signals);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    signals.database = "connected";
  } catch (qe) {
    signals.database = "error";
    signals.warnings.push("database_ping_failed:" + (qe && qe.message ? qe.message : String(qe)));
    return attachDigestStatus(signals);
  }

  const t0 = startOfToday();

  try {
    const [
      depositPaidToday,
      stuckWithoutDeposit,
      ordersAwaitingDeposit,
      ready,
      printing,
      qc,
      completed,
      missingNextAction,
      draftsN,
      approvedN,
      errN,
    ] = await Promise.all([
      prisma.order.count({
        where: { deletedAt: null, depositPaidAt: { gte: t0 } },
      }),
      prisma.order.count({
        where: {
          deletedAt: null,
          depositPaidAt: null,
          status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
        },
      }),
      prisma.order.count({
        where: {
          deletedAt: null,
          depositPaidAt: null,
          status: {
            in: ["INTAKE", "QUOTE_SENT", "ATTENTION_REQUIRED", "AWAITING_DEPOSIT"],
          },
        },
      }),
      prisma.order.count({ where: { deletedAt: null, status: "PRODUCTION_READY" } }),
      prisma.order.count({ where: { deletedAt: null, status: "PRINTING" } }),
      prisma.order.count({ where: { deletedAt: null, status: "QC" } }),
      prisma.order.count({
        where: {
          deletedAt: null,
          OR: [
            { status: { in: ["READY", "COMPLETED"] } },
            { completedAt: { not: null } },
          ],
        },
      }),
      prisma.order.count({
        where: {
          deletedAt: null,
          status: "PRODUCTION_READY",
          OR: [{ nextAction: null }, { nextAction: "" }],
        },
      }),
      prisma.communicationApproval.count({
        where: { status: { in: ["DRAFT", "PENDING"] } },
      }),
      prisma.communicationApproval.count({ where: { status: "APPROVED" } }),
      prisma.communicationApproval.count({ where: { status: "ERROR" } }),
    ]);

    try {
      signals.pickupGapN = await prisma.order.count({
        where: {
          deletedAt: null,
          status: { in: ["COMPLETED", "READY"] },
          NOT: {
            communicationApprovals: { some: { messageType: "READY_FOR_PICKUP" } },
          },
        },
      });
    } catch (_pickup) {
      signals.warnings.push("pickup_followup_metric_unavailable");
    }

    try {
      signals.artChangesN = await prisma.order.count({
        where: { deletedAt: null, artApprovalStatus: "CHANGES_REQUESTED" },
      });
    } catch (_art) {
      signals.warnings.push("art_changes_metric_unavailable");
    }

    signals.depositPaidToday = depositPaidToday;
    signals.stuckWithoutDeposit = stuckWithoutDeposit;
    signals.ordersAwaitingDeposit = ordersAwaitingDeposit;
    signals.ready = ready;
    signals.printing = printing;
    signals.qc = qc;
    signals.completed = completed;
    signals.missingNextAction = missingNextAction;
    signals.commsNeedsApproval = draftsN;
    signals.commsApproved = approvedN;
    signals.commsErrors = errN;

    const activeRows = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
      },
      take: 250,
      select: {
        status: true,
        depositPaidAt: true,
        depositReceived: true,
        depositStatus: true,
        garmentsOrdered: true,
        blockedReason: true,
        updatedAt: true,
        assignedProductionTo: true,
        quantity: true,
        garmentType: true,
        productionTypeFinal: true,
        printMethod: true,
        artFiles: { select: { approvalStatus: true } },
        vendorOrders: { take: 5, select: { status: true } },
        lineItems: { take: 8, select: { id: true } },
      },
    });

    let stuck = 0;
    for (const o of activeRows) {
      const reasons = computeStuckReasons({
        status: o.status,
        depositPaidAt: o.depositPaidAt,
        depositReceived: o.depositReceived,
        depositStatus: o.depositStatus,
        garmentsOrdered: o.garmentsOrdered,
        blockedReason: o.blockedReason,
        updatedAt: o.updatedAt,
        quantity: o.quantity,
        garmentType: o.garmentType,
        productionTypeFinal: o.productionTypeFinal,
        printMethod: o.printMethod,
        artFiles: o.artFiles,
        vendorOrders: o.vendorOrders,
        lineItems: o.lineItems,
      });
      if (reasons.length) stuck += 1;
    }
    signals.stuck = stuck;

    const jeremyRows = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
        assignedProductionTo: { not: null },
      },
      select: { assignedProductionTo: true, status: true },
    });
    let ja = 0;
    for (const r of jeremyRows) {
      if (String(r.assignedProductionTo || "").trim().toLowerCase() !== jLower) continue;
      ja += 1;
    }
    signals.jeremyAssigned = ja;

    const balanceRows = await prisma.order.findMany({
      where: { deletedAt: null },
      take: 800,
      select: {
        totalAmount: true,
        quotedAmount: true,
        total: true,
        amountPaid: true,
      },
    });
    let balanceDue = 0;
    for (const r of balanceRows) {
      const tot =
        Number(r.totalAmount ?? 0) ||
        Number(r.quotedAmount ?? 0) ||
        Number(r.total ?? 0) ||
        0;
      const paid = Number(r.amountPaid ?? 0) || 0;
      if (tot - paid > 0.02) balanceDue += tot - paid;
    }
    signals.balanceDue = Math.round(balanceDue * 100) / 100;
  } catch (ce) {
    signals.warnings.push("owner_counts_failed:" + (ce && ce.message ? ce.message : String(ce)));
  }

  try {
    const salesEng = require(path.join(__dirname, "salesOpportunityEngine.service"));
    const sm = await salesEng.getSalesMetricsForOperator();
    signals.salesOpen = sm.openOpportunities;
    signals.salesHigh = sm.highPriority;
    signals.salesPipeline = sm.estimatedPipeline;
    signals.salesDraftsWaiting = sm.draftsWaiting;
  } catch (_se) {
    signals.warnings.push("sales_metrics_unavailable");
  }

  try {
    const fe = require(path.join(__dirname, "fulfillmentEngine.service"));
    signals.fulfillment = await fe.getFulfillmentMetrics();
  } catch (_fe) {
    /* keep defaults */
  }

  return attachDigestStatus(signals);
}

/**
 * @param {object} sig - from collectOwnerSignals
 * @param {object} cash
 * @param {object} production
 * @param {object} comms
 * @param {object} sales
 */
function buildOwnerRisks(sig, cash, production, comms, sales) {
  const risks = [];
  if (sig.database !== "connected") {
    risks.push("Database unavailable — command center data is incomplete");
  }
  if (sig.selfFixDisabled) risks.push("Self-fix system is disabled");
  if (sig.squareWebhookSkipVerify) risks.push("Square webhook signature verify is skipped");
  if (sig.stuckWithoutDeposit > 0) {
    risks.push("Paid orders are stuck before production (missing deposit timestamp on active jobs)");
  }
  if (production.stuck > 0) {
    risks.push("Production jobs look stuck or blocked — review board");
  }
  if (comms.needsApproval > 0) risks.push("Customer messages need approval");
  if (comms.errors > 0) risks.push("Comms errors need review");
  if (sales.highPriority > 0 && sales.openOpportunities > 0) {
    risks.push("High-value sales opportunities are waiting");
  }
  if (sig.salesDraftsWaiting > 0) risks.push("Sales follow-up drafts need approval");
  if (sig.artChangesN > 0) risks.push("Orders have customer art changes requested");
  if (sig.pickupGapN > 0) risks.push("Completed orders may need pickup/balance follow-up");
  const f = sig.fulfillment || {};
  if (f.needsReview > 0) {
    risks.push("Completed orders need pickup/shipping decision or shipping data is incomplete");
  }
  if (f.shippingStaged > 0) {
    risks.push("Shipping orders staged — labels require manual Pirate Ship copy/paste");
  }
  if (f.pickupReady > 0 && comms.needsApproval > 0) {
    risks.push("Pickup messages waiting for approval");
  }
  if (sig.jeremyAssigned > 0 && !sig.jeremyActiveClock) {
    risks.push("Jeremy has assigned work but is not clocked in");
  }
  if (sig.missingNextAction > 0) {
    risks.push("Production-ready orders missing next action / assignment");
  }
  const cf = sig.cashflow || {};
  if (cf.obligations7d > 0 && cf.cashOnHand < cf.obligations7d) {
    risks.push("Critical bills due soon — 7-day obligations exceed recorded cash on hand");
  }
  if (cf.overdueTotal > 0) risks.push("Overdue obligations need action");
  if ((cf.shortfallCents || 0) > 0) risks.push("Safe-to-spend is negative after 14-day obligations");
  if (cf.obligations14d > 0 && cf.cashOnHand + cf.expectedIncome7d < cf.obligations14d) {
    risks.push("Expected income is not enough to cover 14-day obligations vs cash on hand");
  }
  const pu = sig.purchasing || {};
  if ((pu.needsApproval || 0) > 0) risks.push("Purchases waiting for approval");
  if ((pu.blocked || 0) > 0) risks.push("Blank orders blocked by insufficient deposit or data");
  if ((pu.orderedNotReceived || 0) > 0) risks.push("Ordered blanks not yet received");
  const qc = sig.qcQuality || {};
  if ((qc.failed || 0) > 0) risks.push("One or more orders failed QC — resolve before shipping");
  if ((qc.reprints || 0) > 0) risks.push("Reprints outstanding — check inventory and purchasing");
  if ((qc.pending || 0) > 5) risks.push("QC queue depth elevated — avoid completing without inspection");
  return risks;
}

/**
 * @param {object} sig
 * @param {object} production
 * @param {object} comms
 * @param {object} sales
 */
function buildOwnerNextActions(sig, production, comms, sales) {
  /** @type {{ priority: string, label: string, link: string, reason: string }[]} */
  const actions = [];

  function add(pri, label, link, reason) {
    actions.push({ priority: pri, label, link, reason });
  }

  if (sig.database !== "connected") {
    add("HIGH", "Fix database connectivity", "/api/operator/status", "Operator status shows DB state");
  }
  if (sig.stuckWithoutDeposit > 0) {
    add(
      "HIGH",
      "Resolve deposit timestamp gaps on active production",
      "/production.html",
      `${sig.stuckWithoutDeposit} active job(s) lack depositPaidAt`
    );
  }
  const cf = sig.cashflow || {};
  if ((cf.riskCount || 0) > 0 || (cf.overdueTotal || 0) > 0 || (cf.shortfallCents || 0) > 0) {
    add("HIGH", "Review cashflow sentinel", "/cashflow.html", "Bills, runway, and debt minimums");
  }
  if (cf.obligations7d > cf.cashOnHand && cf.obligations7d > 0) {
    add(
      "HIGH",
      "Collect deposits before spending",
      "/owner.html",
      "7-day obligations exceed recorded cash on hand"
    );
  }
  if ((cf.shortfallCents || 0) > 0) {
    add("MEDIUM", "Delay noncritical spending", "/cashflow.html", "Safe-to-spend is capped until runway clears");
  }
  const pu = sig.purchasing || {};
  if ((pu.needsApproval || 0) > 0) {
    add("HIGH", "Review purchasing queue", "/purchasing.html", `${pu.needsApproval} plan(s) need approval`);
  }
  if ((pu.blocked || 0) > 0) {
    add("HIGH", "Collect deposit before buying blanks", "/purchasing.html", `${pu.blocked} blocked purchase plan(s)`);
  }
  if ((pu.orderedNotReceived || 0) > 0) {
    add("MEDIUM", "Approve funded blank purchases / track receiving", "/purchasing.html", `${pu.orderedNotReceived} ordered, not received`);
  }
  const qc = sig.qcQuality || {};
  if ((qc.pending || 0) > 0 || (qc.failed || 0) > 0 || (qc.reprints || 0) > 0) {
    add(
      "HIGH",
      "Quality control queue",
      "/qc.html",
      `${qc.pending} pending · ${qc.failed} failed · ${qc.reprints} reprint(s)`
    );
  }
  if (production.stuck > 0) {
    add(
      "HIGH",
      "Unstick production jobs",
      "/production.html",
      `${production.stuck} job(s) flagged with blockers or staleness`
    );
  }
  if (sig.missingNextAction > 0) {
    add(
      "HIGH",
      "Assign ready orders",
      "/production.html",
      `${sig.missingNextAction} PRODUCTION_READY without nextAction`
    );
  }
  if (comms.needsApproval > 0) {
    add(
      "HIGH",
      "Approve customer comms drafts",
      "/comms.html",
      `${comms.needsApproval} message(s) in the queue`
    );
  }
  if (sales.highPriority > 0 && sales.openOpportunities > 0) {
    add(
      "MEDIUM",
      "Work top sales opportunities",
      "/sales.html",
      `${sales.highPriority} high-priority open opportunity bucket(s)`
    );
  }
  if (sig.salesDraftsWaiting > 0) {
    add(
      "MEDIUM",
      "Approve sales follow-up drafts",
      "/comms.html",
      `${sig.salesDraftsWaiting} sales draft(s) waiting`
    );
  }
  if (sig.jeremyActiveClock && sig.jeremyAssigned === 0) {
    add(
      "LOW",
      "Confirm Jeremy task assignments",
      "/jeremy.html",
      "Clocked in with no assigned active jobs"
    );
  }
  const ds = sig.digestStatus || {};
  if (!ds.generatedToday) {
    add(
      "MEDIUM",
      "Review today's digest",
      "/digest.html",
      "Morning control brief not generated yet (NY date)"
    );
  }
  if (sig.pickupGapN > 0) {
    add(
      "MEDIUM",
      "Pickup / balance follow-ups",
      "/comms.html",
      `${sig.pickupGapN} completed-style order(s) missing pickup draft`
    );
  }
  const f = sig.fulfillment || {};
  if (f.needsReview > 0 || f.pickupReady > 0 || f.shippingStaged > 0) {
    add(
      "MEDIUM",
      "Review fulfillment queue",
      "/fulfillment.html",
      `${f.needsReview} need review · ${f.pickupReady} pickup · ${f.shippingStaged} ship/local staged`
    );
  }
  if (f.shippingStaged > 0) {
    add("MEDIUM", "Create Pirate Ship draft", "/fulfillment.html", "Copy JSON into Pirate Ship (no auto-buy)");
  }
  if (f.pickupReady > 0) {
    add("MEDIUM", "Approve pickup messages", "/comms.html", "Ready-for-pickup drafts may be pending");
  }
  if (comms.errors > 0) {
    add("MEDIUM", "Review comms errors", "/comms.html", `${comms.errors} error row(s)`);
  }

  const priOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  actions.sort((a, b) => (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9));

  const seen = new Set();
  const dedup = [];
  for (const a of actions) {
    const k = a.label + a.link;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(a);
  }
  return dedup.slice(0, 5);
}

function pickHeadline(risks, nextActions) {
  const hi = nextActions.find((a) => a.priority === "HIGH");
  if (hi) return hi.label;
  if (risks.length) return String(risks[0]).slice(0, 120);
  return "Shop status — review tiles below";
}

async function buildOwnerSummary() {
  const sig = await collectOwnerSignals();
  const cash = {
    depositPaidToday: sig.depositPaidToday,
    ordersAwaitingDeposit: sig.ordersAwaitingDeposit,
    balanceDue: sig.balanceDue,
  };
  const production = {
    ready: sig.ready,
    printing: sig.printing,
    qc: sig.qc,
    completed: sig.completed,
    stuck: sig.stuck,
  };
  const jeremy = {
    assigned: sig.jeremyAssigned,
    activeClock: sig.jeremyActiveClock,
    hoursToday: sig.jeremyHoursToday,
  };
  const comms = {
    needsApproval: sig.commsNeedsApproval,
    approved: sig.commsApproved,
    errors: sig.commsErrors,
  };
  const sales = {
    openOpportunities: sig.salesOpen,
    highPriority: sig.salesHigh,
    estimatedPipeline: sig.salesPipeline,
    draftsWaiting: sig.salesDraftsWaiting,
  };
  const fulfillment = sig.fulfillment || {
    pickupReady: 0,
    shippingStaged: 0,
    needsReview: 0,
    completedToday: 0,
  };
  const digest = sig.digestStatus || {
    generatedToday: false,
    lastGeneratedAt: null,
    topPriorityCount: 0,
    riskCount: 0,
  };

  const cashflow = {
    cashOnHand: sig.cashflow?.cashOnHand ?? 0,
    expectedIncome7d: sig.cashflow?.expectedIncome7d ?? 0,
    obligations7d: sig.cashflow?.obligations7d ?? 0,
    overdueTotal: sig.cashflow?.overdueTotal ?? 0,
    safeToSpend: sig.cashflow?.safeToSpend ?? 0,
    riskCount: sig.cashflow?.riskCount ?? 0,
  };

  const purchasing = {
    needsApproval: sig.purchasing?.needsApproval ?? 0,
    blocked: sig.purchasing?.blocked ?? 0,
    orderedNotReceived: sig.purchasing?.orderedNotReceived ?? 0,
    estimatedSpendPending: sig.purchasing?.estimatedSpendPending ?? 0,
  };

  const qc = {
    pending: sig.qcQuality?.pending ?? 0,
    failed: sig.qcQuality?.failed ?? 0,
    reprints: sig.qcQuality?.reprints ?? 0,
  };

  const risks = buildOwnerRisks(sig, cash, production, comms, sales);
  const nextActions = buildOwnerNextActions(sig, production, comms, sales);
  const headline = pickHeadline(risks, nextActions);

  return {
    ok: true,
    headline,
    cash,
    cashflow,
    purchasing,
    qc,
    production,
    jeremy,
    comms,
    sales,
    fulfillment,
    digest,
    risks,
    nextActions,
    warnings: sig.warnings.length ? sig.warnings : undefined,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  collectOwnerSignals,
  buildOwnerRisks,
  buildOwnerNextActions,
  buildOwnerSummary,
};
