"use strict";

const path = require("path");

const { computeStuckReasons } = require("../services/operatorStuckReasons");
const { getPlanBoardExtras } = require("../services/purchasingEngine.service");
const { getQcBoardExtras } = require("../services/qcEngine.service");
const workflowRules = require("../workflow/orderWorkflowRules");
const approvalEngine = require("../workflow/approvalEngine");
const squareReadConnector = require("../connectors/squareReadConnector");
const metricsCollector = require("../diagnostics/metricsCollector");
const traceEngine = require("../diagnostics/traceEngine");
const { normalizeOrderStatus, normalizeArtStatus } = require("../utils/statusNormalizer");
const { normalizeSections } = require("./dashboardNormalizer");
const { MOCK_LABEL, mockNormalizedSections, mockTodaysFocus } = require("./mockDashboardData");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function skinnyOrderMinimal(o, stuckReasons, extras) {
  const canonical = workflowRules.deriveCanonicalStageFromOrder(o);
  const gates = workflowRules.productionGateSnapshot(o);
  const prodEval = workflowRules.evaluateProductionReadyTransition(o);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    email: o.email,
    status: o.status,
    canonicalStage: canonical,
    blockedReason: o.blockedReason,
    depositPaid: workflowRules.depositPaid(o),
    depositStatus: o.depositStatus,
    artApprovalStatus: o.artApprovalStatus,
    garmentsOrdered: o.garmentsOrdered,
    garmentsReceived: o.garmentsReceived,
    garmentOrderNeeded: o.garmentOrderNeeded !== false,
    isApproved: !!o.isApproved,
    readyForPickup: !!o.readyForPickup,
    printMethod: o.printMethod,
    productionTypeFinal: o.productionTypeFinal,
    quoteExpiresAt: o.quoteExpiresAt,
    assignedProductionTo: o.assignedProductionTo,
    garmentVendor: o.garmentVendor,
    workOrderNumber: o.workOrderNumber,
    digitizingRequired: !!o.digitizingRequired,
    digitizingStatus: o.digitizingStatus,
    artFileStatus: o.artFileStatus,
    squareInvoiceId: o.squareInvoiceId,
    squareInvoicePublished: !!o.squareInvoicePublished,
    lineItemsSummary: summarizeLine(o.lineItems),
    stuckReasons: stuckReasons || [],
    productionGates: gates,
    productionReadyOk: prodEval.ok,
    productionReadyBlockers: prodEval.ok ? [] : prodEval.blockers,
    ...(extras && typeof extras === "object" ? extras : {}),
  };
}

function summarizeLine(items) {
  try {
    if (!items || !items.length) return null;
    return items
      .slice(0, 10)
      .map((i) => `${String(i.description || "").slice(0, 60)} ×${i.quantity ?? "?"}`)
      .join("; ");
  } catch (_e) {
    return null;
  }
}

async function loadOrdersForDashboard() {
  const prisma = getPrisma();
  if (!prisma || !prisma.order) return [];
  try {
    return await prisma.order.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 350,
      include: {
        estimates: { take: 3, select: { id: true, status: true } },
        lineItems: { take: 8, select: { description: true, quantity: true, productionType: true } },
        artFiles: { take: 6, select: { id: true, approvalStatus: true } },
        vendorOrders: { take: 4, select: { id: true, status: true } },
      },
    });
  } catch (_e) {
    return [];
  }
}

async function communicationDraftCounts(ids) {
  const prisma = getPrisma();
  if (!prisma || !ids.length) return {};
  /** @type {Record<string, number>} */
  const map = {};
  const grouped = await prisma.communicationApproval.groupBy({
    by: ["orderId"],
    where: {
      orderId: { in: ids },
      status: { notIn: ["SENT", "CANCELED"] },
    },
    _count: { _all: true },
  });
  for (const g of grouped) {
    if (g.orderId) map[g.orderId] = g._count._all;
  }
  return map;
}

async function hydrateOrdersMinimal(rows) {
  const ids = rows.map((x) => x.id);
  const counts = await communicationDraftCounts(ids);
  const out = [];
  for (const o of rows) {
    const stuck = computeStuckReasons(o);
    const ac = String(o.artApprovalStatus || "NOT_REQUESTED").toUpperCase();
    let purchasing = null;
    try {
      purchasing = getPlanBoardExtras(o.id);
    } catch (_pe) {
      purchasing = null;
    }
    let qc = null;
    try {
      qc = getQcBoardExtras(o.id, o.status);
    } catch (_qe) {
      qc = null;
    }
    out.push(
      skinnyOrderMinimal(o, stuck, {
        commsDraftCount: counts[o.id] || 0,
        needsCustomerApproval: ac === "REQUESTED" || ac === "CHANGES_REQUESTED",
        purchasing,
        qcExtras: qc,
      })
    );
  }
  return out;
}

/** @returns {Promise<object>} */
async function buildCashRisks() {
  const risks = [];
  /** @type {object[]} */
  let unpaidSquare = [];
  try {
    if (squareReadConnector.isConfiguredSync && squareReadConnector.isConfiguredSync()) {
      const pack = await squareReadConnector.findUnpaidInvoices();
      unpaidSquare = pack && Array.isArray(pack.items) ? pack.items : [];
    }
  } catch (_e) {
    unpaidSquare = [];
  }

  unpaidSquare.slice(0, 40).forEach((inv) => {
    risks.push({
      kind: "unpaid_invoice",
      label: `${inv.customerNameHint || inv.title || "Invoice"}`.slice(0, 120),
      amountHint: inv.totalAmount || inv.computedDueCents || inv.amountMoney || null,
      reference: inv.id || inv.invoiceId || null,
    });
  });

  try {
    const fol = await squareReadConnector.getEstimateFollowups();
    const stale = fol && Array.isArray(fol.staleOpenOrders) ? fol.staleOpenOrders : [];
    stale.slice(0, 25).forEach((e) => {
      risks.push({
        kind: "estimate_followup",
        label: String(e.title || e.id || "Estimate").slice(0, 120),
        reference: e.id || null,
      });
    });
  } catch (_e) {}

  const orders = await loadOrdersForDashboard();
  const hydrated = await hydrateOrdersMinimal(orders);

  hydrated.forEach((h) => {
    const o = orders.find((x) => x.id === h.id);
    if (!o) return;
    const st = String(h.status || "").toUpperCase();
    if (st === "COMPLETED" || st === "READY" || o.completedAt || h.readyForPickup) return;
    if (!workflowRules.depositPaid(o) && (o.squareInvoiceId || o.squareInvoicePublished)) {
      risks.push({
        kind: "deposit_missing_db",
        orderId: h.id,
        customerName: h.customerName,
        status: h.status,
      });
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    squareConfigured: !!(squareReadConnector.isConfiguredSync && squareReadConnector.isConfiguredSync()),
    risks: risks.slice(0, 80),
    unpaidInvoiceApprox: unpaidSquare.length,
  };
}

function pickTodaysFocus(hydrated) {
  /** @type {object | null} */
  let best = null;
  let score = -1;

  hydrated.forEach((h) => {
    let s = 0;

    if (h.stuckReasons && h.stuckReasons.length) s += 20;
    if (h.needsCustomerApproval) s += 12;
    if (h.canonicalStage === "GARMENTS_NEEDED") s += 11;
    if (!h.depositPaid && h.squareInvoiceId) s += 9;
    if (h.canonicalStage === "ON_HOLD") s += 16;
    if (h.operatorProductionPriority === "RUSH" || String(h.operatorProductionPriority || "").toUpperCase() === "RUSH") {
      s += 6;
    }
    const nst = normalizeOrderStatus(h.status);
    if (nst === "IN_PRODUCTION" || nst === "READY_FOR_PRODUCTION" || nst === "QC") s += 4;

    if (s > score) {
      score = s;
      best = h;
    }
  });

  const title = best
    ? `${best.customerName || "Customer"} · ${best.canonicalStage || best.status}${best.orderNumber ? " · #" + best.orderNumber : ""}`
    : "No queued issues detected — verify Square + mailbox for fresh intake.";

  return {
    title,
    priorityOrderId: best && best.id,
    priorityScoreApprox: score,
    hint: best && best.blockedReason ? String(best.blockedReason).slice(0, 240) : null,
  };
}

async function buildIntakePipeline() {
  const rows = await loadOrdersForDashboard();
  const hydrated = await hydrateOrdersMinimal(rows);

  /** @type {object[]} */
  const newRequests = [];
  /** @type {object[]} */
  const estimateNeeded = [];
  /** @type {object[]} */
  const invoiceNeeded = [];
  /** @type {object[]} */
  const waitingCustomer = [];

  hydrated.forEach((h) => {
    const canon = h.canonicalStage;
    const st = String(h.status || "").toUpperCase();
    const o = rows.find((x) => x.id === h.id);

    if (canon === "INTAKE" || st === "INTAKE") newRequests.push(h);

    if (canon === "ESTIMATE_SENT" || (o?.estimates && o.estimates.length && !o.squareInvoicePublished)) estimateNeeded.push(h);

    if (canon === "AWAITING_DEPOSIT" || canon === "INVOICE_SENT") invoiceNeeded.push(h);

    if (h.needsCustomerApproval || canon === "EVALUATE_APPROVE") waitingCustomer.push(h);
  });

  return {
    generatedAt: new Date().toISOString(),
    newRequests,
    estimateNeeded,
    invoiceNeeded,
    waitingCustomer,
  };
}

async function buildArtPipeline() {
  const rows = await loadOrdersForDashboard();
  const hydrated = await hydrateOrdersMinimal(rows);

  /** @type {Record<string, object[]>} */
  const buckets = {
    missing: [],
    digitizing: [],
    pendingApproval: [],
    approved: [],
  };

  hydrated.forEach((h) => {
    const canon = h.canonicalStage;
    const ac = normalizeArtStatus(h.artApprovalStatus || h.artFileStatus);

    if (canon === "ART_NEEDED" || ac === "NEEDS_ART" || /MISSING|TBD/i.test(String(h.artFileStatus || "")))
      buckets.missing.push(h);
    if (canon === "DIGITIZING" || h.digitizingRequired) buckets.digitizing.push(h);
    if (
      ac === "ART_IN_REVIEW" ||
      ac === "CHANGES_REQUESTED" ||
      h.needsCustomerApproval ||
      canon === "ART_CHECK"
    ) {
      if (!workflowRules.artIsApproved(rows.find((x) => x.id === h.id) || {})) buckets.pendingApproval.push(h);
    }
    if (
      workflowRules.artIsApproved(rows.find((x) => x.id === h.id) || {}) &&
      canon !== "ART_NEEDED" &&
      canon !== "DIGITIZING"
    ) {
      buckets.approved.push(h);
    }
  });

  return { generatedAt: new Date().toISOString(), ...buckets };
}

async function buildProductionBoardBuckets() {
  const rows = await loadOrdersForDashboard();
  const hydrated = await hydrateOrdersMinimal(rows);

  /** @type {Record<string, object[]>} */
  const board = {
    approvedForProduction: [],
    garmentsNeeded: [],
    garmentsOrdered: [],
    productionReady: [],
    inProduction: [],
    qc: [],
    readyForPickup: [],
  };

  hydrated.forEach((h) => {
    const st = normalizeOrderStatus(h.status);

    const orderRow = rows.find((x) => x.id === h.id) || {};

    if (orderRow.completedAt || st === "COMPLETED") return;

    if (h.readyForPickup || st === "COMPLETE") board.readyForPickup.push(h);
    else if (st === "QC") board.qc.push(h);
    else if (st === "IN_PRODUCTION") board.inProduction.push(h);
    else if (st === "READY_FOR_PRODUCTION") board.productionReady.push(h);
    else if (h.garmentsOrdered && !h.garmentsReceived) board.garmentsOrdered.push(h);
    else if (h.depositPaid && h.garmentOrderNeeded && !h.garmentsOrdered) board.garmentsNeeded.push(h);
    else if (
      h.depositPaid &&
      workflowRules.artIsApproved(orderRow) &&
      h.isApproved &&
      (workflowRules.workOrderCreated(orderRow) || h.workOrderNumber)
    ) {
      board.approvedForProduction.push(h);
    }
  });

  return {
    generatedAt: new Date().toISOString(),
    columns: board,
  };
}

async function buildGarmentBoard(primaryVendorLabel = "Carolina Made") {
  const prod = await buildProductionBoardBuckets();
  const needed = prod.columns.garmentsNeeded.slice(0, 80);
  const ordered = prod.columns.garmentsOrdered.slice(0, 80);

  const carolinaCandidates = needed.filter((h) => {
    const gv = String(h.garmentVendor || "").toLowerCase();
    return !gv || gv.includes("carolina") || gv.includes(primaryVendorLabel.toLowerCase());
  });

  return {
    generatedAt: new Date().toISOString(),
    primaryVendor: primaryVendorLabel,
    needingBlanks: needed,
    carolinaDraftCandidates: carolinaCandidates,
    waitingOnGarments: ordered,
    receivedReady: prod.columns.productionReady.slice(0, 60),
    note: "Vendor drafts internal only — approval required before send.",
  };
}

async function buildApprovalsPanel() {
  const pending = approvalEngine.getPendingApprovals();
  return {
    generatedAt: new Date().toISOString(),
    count: pending.length,
    pending: pending.slice(0, 100).map((p) => ({
      approvalId: p.approvalId,
      taskId: p.taskId,
      category: p.category,
      riskLevel: p.riskLevel,
      requestedBy: p.requestedBy,
      requestedAt: p.requestedAt,
      status: p.status,
      reason: p.reason || null,
    })),
    note: "Use existing /api/approvals endpoints to approve/reject — no mutations from dashboard route.",
  };
}

async function buildSystemHealth() {
  /** @type {object} */
  let roll = {};
  try {
    roll = metricsCollector.rollup();
  } catch (_e) {}

  /** @type {object[]} */
  let traces = [];
  try {
    traces = traceEngine.tailTraces(15);
  } catch (_e) {}

  return {
    generatedAt: new Date().toISOString(),
    metricsRollup: roll,
    recentTraceCount: traces.length,
    degraded: !!(roll.failuresLastHour && roll.failuresLastHour > 40),
  };
}

async function buildMainDashboard() {
  const rowSnap = await loadOrdersForDashboard();
  const intake = await buildIntakePipeline();
  const art = await buildArtPipeline();
  const production = await buildProductionBoardBuckets();
  const cash = await buildCashRisks();
  const garments = await buildGarmentBoard();
  const approvals = await buildApprovalsPanel();
  const health = await buildSystemHealth();
  const blocked = await blockedOrdersSummary();

  const hydrated = [].concat(
    intake.newRequests,
    intake.estimateNeeded,
    production.columns.productionReady,
    production.columns.inProduction
  );
  const unique = [];
  const seen = new Set();
  hydrated.forEach((x) => {
    if (!x || !x.id || seen.has(x.id)) return;
    seen.add(x.id);
    unique.push(x);
  });

  let todaysFocus = pickTodaysFocus(unique.length ? unique : Object.values(production.columns).flat());
  const liveOrderSignal = !!(rowSnap && rowSnap.length) || !!(blocked && blocked.count);
  if (!liveOrderSignal) {
    const mf = mockTodaysFocus();
    todaysFocus = {
      ...todaysFocus,
      title: mf.title,
      source: MOCK_LABEL,
    };
  }

  /** @type {Record<string, { cards: object[], sectionSource: string }>} */
  let normalizedSections = normalizeSections(
    { intake, cash, art, garments, production, approvals, blocked },
    "live"
  );
  const mockNorm = mockNormalizedSections();
  const sectionKeys = ["cash", "intake", "art", "garments", "production", "approvals", "blocked"];
  sectionKeys.forEach((k) => {
    const cur = normalizedSections[k];
    if (!cur || !cur.cards.length) {
      normalizedSections[k] = { cards: mockNorm[k].cards.slice(), sectionSource: MOCK_LABEL };
    }
  });

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    todaysFocus,
    normalizedSections,
    cashRisks: cash,
    intakePipeline: intake,
    artPipeline: art,
    productionBoard: production,
    garmentBoard: garments,
    approvals,
    blockedOrders: blocked,
    systemHealth: health,
    rulesVersion: "v8.1",
  };
}

async function blockedOrdersSummary() {
  const rows = await loadOrdersForDashboard();
  const hydrated = await hydrateOrdersMinimal(rows);
  const blocked = hydrated.filter((h) => {
    const st = String(h.status || "").toUpperCase();
    if (["COMPLETED", "READY"].includes(st) || h.readyForPickup) return false;
    if (h.blockedReason && String(h.blockedReason).trim()) return true;
    if ((h.stuckReasons || []).length) return true;
    return false;
  });
  return {
    generatedAt: new Date().toISOString(),
    count: blocked.length,
    orders: blocked.slice(0, 120),
  };
}

module.exports = {
  buildMainDashboard,
  buildCashRisks,
  buildIntakePipeline,
  buildArtPipeline,
  buildProductionBoardBuckets,
  buildGarmentBoard,
  buildApprovalsPanel,
  buildSystemHealth,
  blockedOrdersSummary,
  loadOrdersForDashboard,
  hydrateOrdersMinimal,
};
