"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { depositCollected, needsBlanks } = require("./cashRiskEngine.service");

const FLOW_STATES = [
  "LEAD",
  "QUOTE_CREATED",
  "QUOTE_SENT",
  "FOLLOWUP_ACTIVE",
  "DEPOSIT_PENDING",
  "DEPOSIT_PAID",
  "ORDER_CREATED",
  "PRODUCTION_READY",
  "PRINTING",
  "QC",
  "READY_FOR_PICKUP",
  "COMPLETED",
];

const FLOW_ENGINE_META = {
  status: "FLOW_ENGINE_ACTIVE",
  lifecycleUnified: true,
  noDroppedOrders: true,
  fullVisibility: true,
  nextAction: "Track every order through flow instead of individual systems.",
};

const MS_DAY = 86400000;

const STUCK_DAYS = {
  QUOTE_SENT: 7,
  FOLLOWUP_ACTIVE: 5,
  DEPOSIT_PENDING: 5,
  DEPOSIT_PAID: 10,
  ORDER_CREATED: 7,
  PRODUCTION_READY: 4,
  PRINTING: 14,
  QC: 5,
  READY_FOR_PICKUP: 7,
};

function flowStorePath() {
  return path.join(__dirname, "..", "..", "data", "order-flow-engine.json");
}

function readStore() {
  try {
    const j = JSON.parse(fs.readFileSync(flowStorePath(), "utf8"));
    if (!j || typeof j !== "object") return { orders: {} };
    if (!j.orders || typeof j.orders !== "object") j.orders = {};
    return j;
  } catch (_) {
    return { orders: {} };
  }
}

function writeStore(store) {
  const p = flowStorePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  store.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(store, null, 2), "utf8");
}

function stateIndex(name) {
  const i = FLOW_STATES.indexOf(String(name || "").toUpperCase());
  return i >= 0 ? i : 0;
}

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

/** @param {object} o */
function hasQuoteRecord(o) {
  return Array.isArray(o.quotes) && o.quotes.length > 0;
}

/** @param {object} o */
function quoteLooksSent(o) {
  if (o.squareInvoiceSentAt) return true;
  if (!o.quotes) return false;
  for (const q of o.quotes) {
    const qs = String(q.status || "").toUpperCase();
    if (["SENT", "OPEN", "PENDING"].includes(qs)) return true;
  }
  return false;
}

/**
 * @param {object} o
 */
function deriveFlowStateFromOrder(o) {
  if (!o || o.deletedAt) return "LEAD";
  const st = String(o.status || "").toUpperCase();

  if (o.completedAt || st === "COMPLETED" || st === "PICKED_UP") {
    return "COMPLETED";
  }

  if (st === "PAID_IN_FULL" && !o.completedAt) {
    return o.readyForPickup ? "READY_FOR_PICKUP" : "ORDER_CREATED";
  }

  if (o.readyForPickup === true) return "READY_FOR_PICKUP";
  if (o.qcComplete === true) return "QC";
  if (o.productionComplete === true) return "QC";
  const pst = String(o.productionStatus || "").toUpperCase();
  if (pst === "PRINTING" || st === "PRINTING") return "PRINTING";

  if (o.jobCreated === true || st === "PRODUCTION_READY" || st === "READY") return "PRODUCTION_READY";

  const paid = depositCollected(o);
  if (paid) {
    if (!o.jobCreated && (st === "INTAKE" || st === "QUOTE_CREATED" || st === "QUOTE_SENT" || st === "DEPOSIT_PENDING")) {
      return "ORDER_CREATED";
    }
    if (!o.jobCreated) return "DEPOSIT_PAID";
    return "PRODUCTION_READY";
  }

  if (st === "DEPOSIT_PENDING") return "DEPOSIT_PENDING";

  if (quoteLooksSent(o) && !paid) {
    if (o.followupCount > 0 || o.followUpSent === true) return "FOLLOWUP_ACTIVE";
    return "QUOTE_SENT";
  }

  if (st === "QUOTE_CREATED" || hasQuoteRecord(o) || st.includes("QUOTE")) return "QUOTE_CREATED";

  return "LEAD";
}

/**
 * @param {object} order
 * @param {string} state
 */
function chooseEnteredAt(order, state) {
  const m = {
    QUOTE_SENT: order.squareInvoiceSentAt || order.updatedAt,
    DEPOSIT_PAID: order.depositPaidAt || order.updatedAt,
    COMPLETED: order.completedAt || order.updatedAt,
    READY_FOR_PICKUP: order.updatedAt,
    PRINTING: order.productionStartedAt || order.updatedAt,
  };
  const d = m[state] || order.updatedAt || order.createdAt;
  return d ? new Date(d).getTime() : Date.now();
}

/**
 * @param {object} order
 * @param {string} state
 */
function timeInStateMs(order, state) {
  if (!order) return 0;
  const entered = chooseEnteredAt(order, state);
  return Math.max(0, Date.now() - entered);
}

/**
 * @param {string} currentState
 * @param {string} event
 */
function eventTargetState(currentState, event) {
  const ev = String(event || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  const cur = stateIndex(currentState);
  const ci = cur;

  if (ev === "quote_sent") {
    if (ci >= stateIndex("QUOTE_SENT")) return { ok: true, target: FLOW_STATES[ci], targetIndex: ci, idempotent: ci >= stateIndex("QUOTE_SENT") };
    if (ci < stateIndex("QUOTE_CREATED")) return { ok: false, error: "must_be_at_least_quote_created", currentState };
    return { ok: true, target: "QUOTE_SENT", targetIndex: stateIndex("QUOTE_SENT") };
  }

  if (ev === "followup_sent") {
    if (ci >= stateIndex("FOLLOWUP_ACTIVE")) return { ok: true, target: FLOW_STATES[ci], targetIndex: ci, idempotent: true };
    if (ci < stateIndex("QUOTE_SENT")) return { ok: false, error: "needs_quote_sent_first", currentState };
    return { ok: true, target: "FOLLOWUP_ACTIVE", targetIndex: stateIndex("FOLLOWUP_ACTIVE") };
  }

  if (ev === "deposit_pending") {
    if (ci >= stateIndex("DEPOSIT_PENDING")) return { ok: true, target: FLOW_STATES[ci], targetIndex: ci, idempotent: true };
    if (ci < stateIndex("QUOTE_SENT")) return { ok: false, error: "needs_quote_sent_first", currentState };
    return { ok: true, target: "DEPOSIT_PENDING", targetIndex: stateIndex("DEPOSIT_PENDING") };
  }

  if (ev === "deposit_paid") {
    if (ci >= stateIndex("DEPOSIT_PAID")) return { ok: true, target: FLOW_STATES[ci], targetIndex: ci, idempotent: true };
    if (ci < stateIndex("DEPOSIT_PENDING")) {
      return { ok: false, error: "deposit_requires_deposit_pending_stage", hint: "emit deposit_pending first" };
    }
    return { ok: true, target: "DEPOSIT_PAID", targetIndex: stateIndex("DEPOSIT_PAID") };
  }

  if (ev === "order_created") {
    if (ci >= stateIndex("ORDER_CREATED")) return { ok: true, target: FLOW_STATES[ci], targetIndex: ci, idempotent: true };
    if (ci < stateIndex("DEPOSIT_PAID")) return { ok: false, error: "needs_deposit_paid_first", currentState };
    return { ok: true, target: "ORDER_CREATED", targetIndex: stateIndex("ORDER_CREATED") };
  }

  if (ev === "production_started") {
    if (ci >= stateIndex("PRINTING")) return { ok: true, target: FLOW_STATES[ci], targetIndex: ci, idempotent: true };
    if (ci === stateIndex("ORDER_CREATED") || ci === stateIndex("DEPOSIT_PAID")) {
      return { ok: true, target: "PRODUCTION_READY", targetIndex: stateIndex("PRODUCTION_READY") };
    }
    if (ci === stateIndex("PRODUCTION_READY")) {
      return { ok: true, target: "PRINTING", targetIndex: stateIndex("PRINTING") };
    }
    return { ok: false, error: "illegal_production_transition", currentState };
  }

  if (ev === "qc_complete") {
    if (ci >= stateIndex("QC")) return { ok: true, target: FLOW_STATES[ci], targetIndex: ci, idempotent: true };
    if (ci < stateIndex("PRINTING")) return { ok: false, error: "needs_printing_first", currentState };
    return { ok: true, target: "QC", targetIndex: stateIndex("QC") };
  }

  if (ev === "pickup_ready") {
    if (ci >= stateIndex("READY_FOR_PICKUP")) return { ok: true, target: FLOW_STATES[ci], targetIndex: ci, idempotent: true };
    if (ci < stateIndex("QC")) return { ok: false, error: "needs_qc_first", currentState };
    return { ok: true, target: "READY_FOR_PICKUP", targetIndex: stateIndex("READY_FOR_PICKUP") };
  }

  if (ev === "completed") {
    if (ci >= stateIndex("COMPLETED")) return { ok: true, target: "COMPLETED", targetIndex: stateIndex("COMPLETED"), idempotent: true };
    if (ci < stateIndex("READY_FOR_PICKUP")) return { ok: false, error: "needs_pickup_ready_first", currentState };
    return { ok: true, target: "COMPLETED", targetIndex: stateIndex("COMPLETED") };
  }

  return { ok: false, error: `unknown_event:${ev}` };
}

function pushIdempotentHistory(store, id, rec, derived, event, idemFlag) {
  rec.history = rec.history || [];
  rec.history.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `fl-${Date.now()}`,
    from: derived,
    to: derived,
    event: String(event).trim(),
    at: new Date().toISOString(),
    idempotent: !!idemFlag,
  });
  rec.lastEventKey = `idem:${event}:${derived}`;
  store.orders[id] = rec;
  writeStore(store);
  return rec.history[rec.history.length - 1];
}

/**
 * @param {string} orderId
 * @param {string} event
 */
async function updateFlowState(orderId, event) {
  const id = String(orderId || "").trim();
  if (!id) return { ok: false, error: "orderId_required" };

  const prisma = getPrisma();
  if (!prisma || !prisma.order) return { ok: false, error: "prisma_unavailable" };

  let o = null;
  try {
    o = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { quotes: true },
    });
  } catch (_) {
    return { ok: false, error: "db_error" };
  }

  if (!o) return { ok: false, error: "order_not_found" };

  const derived = deriveFlowStateFromOrder(o);
  const dIdx = stateIndex(derived);
  let plan = eventTargetState(derived, event);

  if (
    !plan.ok &&
    plan.error === "deposit_requires_deposit_pending_stage" &&
    dIdx >= stateIndex("DEPOSIT_PAID")
  ) {
    plan = { ok: true, target: derived, targetIndex: dIdx, idempotent: true };
  }

  if (!plan.ok) {
    return { ok: false, error: plan.error || "transition_rejected", derivedState: derived, details: plan };
  }

  const store = readStore();
  const rec = store.orders[id] || { history: [] };

  if (plan.idempotent) {
    const entry = pushIdempotentHistory(store, id, rec, derived, event, true);
    return { ok: true, idempotent: true, currentState: derived, entry };
  }

  const target = plan.target;
  const tIdx = plan.targetIndex;
  if (tIdx > dIdx + 1) {
    return { ok: false, error: "no_skipping_states", derivedState: derived, wouldReach: target };
  }
  if (tIdx < dIdx) {
    return { ok: false, error: "no_backward_transition", derivedState: derived, requested: target };
  }
  if (tIdx === dIdx) {
    const entry = pushIdempotentHistory(store, id, rec, derived, event, true);
    return { ok: true, idempotent: true, currentState: derived, entry };
  }

  rec.history = rec.history || [];
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `fl-${Date.now()}`,
    from: derived,
    to: target,
    event: String(event).trim(),
    at: new Date().toISOString(),
  };
  rec.history.push(entry);
  rec.lastEventKey = `${event}:${target}`;
  rec.lastTransitionAt = entry.at;
  store.orders[id] = rec;
  writeStore(store);

  return {
    ok: true,
    orderId: id,
    derivedState: derived,
    loggedTarget: target,
    entry,
    note: "Audit log only — order row remains source of truth; sync via existing APIs.",
  };
}

function nextStateName(current) {
  const i = stateIndex(current);
  if (i >= FLOW_STATES.length - 1) return null;
  return FLOW_STATES[i + 1];
}

/**
 * @param {object} order
 * @param {string} currentState
 */
function computeBlockers(order, currentState) {
  const blockers = [];
  if (!order) return blockers;

  if (needsBlanks(order) && !depositCollected(order)) {
    blockers.push({ code: "CASH_BEFORE_BLANKS", detail: "Deposit required before blanks/production spend." });
  }

  const ms = timeInStateMs(order, currentState);
  const cap = STUCK_DAYS[currentState];
  if (cap && ms > cap * MS_DAY) {
    blockers.push({
      code: "STUCK_IN_STATE",
      detail: `${Math.floor(ms / MS_DAY)}d in ${currentState} (threshold ${cap}d).`,
    });
  }

  return blockers;
}

function recommendedActionFor(order, currentState, blockers) {
  if (blockers && blockers.length) {
    const b = blockers[0];
    if (b.code && String(b.code).includes("CASH")) return "Collect deposit before ordering garments.";
    if (b.code === "STUCK_IN_STATE") return "Review flow / revenue / production — clear blocker before advancing.";
  }
  const hints = {
    LEAD: "Qualify and create quote.",
    QUOTE_CREATED: "Send quote / invoice to customer.",
    QUOTE_SENT: "Mark deposit_pending when invoice is out; follow up.",
    FOLLOWUP_ACTIVE: "Chase deposit; move to deposit_pending when appropriate.",
    DEPOSIT_PENDING: "Collect deposit (cash command center).",
    DEPOSIT_PAID: "Mark order_created when scoped for production.",
    ORDER_CREATED: "production_started — route job / release holds.",
    PRODUCTION_READY: "Start print — second production_started moves to PRINTING.",
    PRINTING: "qc_complete when print passes QC.",
    QC: "pickup_ready when packaged.",
    READY_FOR_PICKUP: "completed on pickup.",
    COMPLETED: "Done — close loop.",
  };
  return hints[currentState] || `Advance toward ${nextStateName(currentState) || "COMPLETE"}.`;
}

/**
 * @param {string} orderId
 */
async function trackFlow(orderId) {
  const id = String(orderId || "").trim();
  const empty = {
    currentState: "LEAD",
    previousStates: [],
    nextState: "QUOTE_CREATED",
    blockers: [],
    timeInState: 0,
    timeInStateMs: 0,
    recommendedAction: "Load order context.",
    failures: [],
    lifecycle: { stage: "LEAD", nextStepInLifecycle: "QUOTE_CREATED" },
  };
  if (!id) return empty;

  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    return { ...empty, blockers: [{ code: "NO_DB", detail: "Prisma unavailable" }] };
  }

  let order = null;
  try {
    order = await prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { quotes: true },
    });
  } catch (_) {
    return { ...empty, blockers: [{ code: "DB_ERROR", detail: "Query failed" }] };
  }

  if (!order) return { ...empty, blockers: [{ code: "NOT_FOUND", detail: "Order not found" }] };

  const currentState = deriveFlowStateFromOrder(order);
  const store = readStore();
  const rec = store.orders[id];
  const history = (rec && rec.history) || [];
  const previousStates = history
    .slice(-12)
    .map((h) => ({ from: h.from, to: h.to, event: h.event, at: h.at }));

  const blockers = computeBlockers(order, currentState);
  const ms = timeInStateMs(order, currentState);
  const failures = [];

  const dQuote = order.squareInvoiceSentAt ? new Date(order.squareInvoiceSentAt).getTime() : 0;
  if (currentState === "QUOTE_SENT" && !depositCollected(order) && dQuote > 0 && Date.now() - dQuote > 3 * MS_DAY) {
    failures.push({
      type: "MISSING_FOLLOWUP",
      detail: "Quote sent >3d without deposit or follow-up stage.",
    });
  }

  if (currentState === "DEPOSIT_PENDING" && order.followupCount === 0 && ms > 2 * MS_DAY) {
    failures.push({ type: "DEPOSIT_NOT_CHASED", detail: "Deposit pending — no follow-ups recorded." });
  }

  if ((currentState === "PRINTING" || currentState === "PRODUCTION_READY") && ms > 10 * MS_DAY) {
    failures.push({
      type: "PRODUCTION_STALLED",
      detail: `${currentState} >10d — verify press queue and gates.`,
    });
  }

  const next = nextStateName(currentState);

  return {
    currentState,
    previousStates,
    nextState: next,
    blockers,
    timeInState: Math.floor(ms / MS_DAY),
    timeInStateMs: ms,
    recommendedAction: recommendedActionFor(order, currentState, blockers),
    failures,
    lifecycle: {
      stage: currentState,
      nextStepInLifecycle: next,
    },
  };
}

/**
 * @param {string} orderId
 */
async function buildFlowView(orderId) {
  const id = String(orderId || "").trim();
  const tracked = await trackFlow(id);
  const store = readStore();
  const rec = store.orders[id];
  const history = (rec && rec.history) || [];

  return {
    ...FLOW_ENGINE_META,
    orderId: id,
    flowStates: FLOW_STATES,
    currentState: tracked.currentState,
    history: history.slice(-50),
    blockers: tracked.blockers,
    nextAction: tracked.recommendedAction,
    nextState: tracked.nextState,
    failures: tracked.failures,
    timeInStateDays: tracked.timeInState,
    previousStates: tracked.previousStates,
    lifecycle: tracked.lifecycle,
  };
}

/**
 * @returns {Promise<object>}
 */
async function buildFlowSummary() {
  const prisma = getPrisma();
  const empty = {
    leads: 0,
    quotes: 0,
    depositsPending: 0,
    production: 0,
    readyForPickup: 0,
    completedToday: 0,
    byState: {},
  };
  if (!prisma || !prisma.order) return { ...empty, ...FLOW_ENGINE_META };

  let orders = [];
  try {
    orders = await prisma.order.findMany({
      where: { deletedAt: null },
      take: 2000,
      orderBy: { updatedAt: "desc" },
      include: { quotes: true },
    });
  } catch (_) {
    return { ...empty, ...FLOW_ENGINE_META };
  }

  const byState = {};
  for (const s of FLOW_STATES) byState[s] = 0;

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);

  let leads = 0;
  let quotes = 0;
  let depositsPending = 0;
  let production = 0;
  let readyForPickup = 0;
  let completedToday = 0;

  for (const o of orders) {
    const st = deriveFlowStateFromOrder(o);
    byState[st] = (byState[st] || 0) + 1;

    if (st === "LEAD") leads += 1;
    if (["QUOTE_CREATED", "QUOTE_SENT", "FOLLOWUP_ACTIVE"].includes(st)) quotes += 1;
    if (st === "DEPOSIT_PENDING" || st === "FOLLOWUP_ACTIVE") depositsPending += 1;
    if (["ORDER_CREATED", "DEPOSIT_PAID", "PRODUCTION_READY", "PRINTING", "QC"].includes(st)) production += 1;
    if (st === "READY_FOR_PICKUP") readyForPickup += 1;
    if (st === "COMPLETED" && o.completedAt && new Date(o.completedAt) >= startToday) completedToday += 1;
  }

  return {
    leads,
    quotes,
    depositsPending,
    production,
    readyForPickup,
    completedToday,
    byState,
    sampleSize: orders.length,
    ...FLOW_ENGINE_META,
  };
}

/**
 * @param {object[]} actions
 */
async function enrichActionsWithFlow(actions) {
  const list = Array.isArray(actions) ? actions : [];
  const out = [];
  for (const a of list) {
    const oid = a && a.orderId;
    if (!oid) {
      out.push({ ...a, flow: null });
      continue;
    }
    try {
      const t = await trackFlow(String(oid));
      out.push({
        ...a,
        flow: {
          currentState: t.currentState,
          nextState: t.nextState,
          nextStepInLifecycle: t.lifecycle && t.lifecycle.nextStepInLifecycle,
          recommendedAction: t.recommendedAction,
        },
      });
    } catch (_) {
      out.push({ ...a, flow: null });
    }
  }
  return out;
}

module.exports = {
  FLOW_STATES,
  deriveFlowStateFromOrder,
  trackFlow,
  updateFlowState,
  buildFlowView,
  buildFlowSummary,
  enrichActionsWithFlow,
  FLOW_ENGINE_META,
};
