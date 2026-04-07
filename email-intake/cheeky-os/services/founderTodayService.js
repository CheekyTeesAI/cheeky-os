/**
 * Bundle 11 — assemble data for GET /founder/today (reads DB + existing services).
 */

const { getNextAction } = require("./nextAction");
const { getAutoFollowupsResponse } = require("./autoFollowupsService");
const { getProductionQueue } = require("./orderStatusEngine");
const { getPrisma } = require("../marketing/prisma-client");
const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("./paymentGateService");
const { getMemory } = require("./orderMemoryService");
const { analyzeJob, inferProductType } = require("./jobIntelligenceService");
const { collectAutomationActions } = require("./automationActionsService");

async function fetchCaptureOrders() {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) return [];
  try {
    return await prisma.captureOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
    });
  } catch (err) {
    console.error("[founderToday] orders:", err.message || err);
    return [];
  }
}

/**
 * @returns {Promise<{
 *   next: object,
 *   paymentBlockers: object[],
 *   urgentFollowups: object[],
 *   readyForProduction: object[],
 *   highRisk: object[],
 *   queue: { ready: object[], printing: object[], qc: object[] },
 *   jobMemory: object[],
 *   systemActions: object[]
 * }>}
 */
function buildJobMemoryRows(orders, paymentBlockers, readyForProduction, queue) {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const ids = [];
  const pushId = (id) => {
    const s = String(id || "").trim();
    if (s && !ids.includes(s)) ids.push(s);
  };

  for (const b of paymentBlockers) pushId(b.orderId);
  for (const r of readyForProduction) pushId(r.orderId);
  for (const x of [
    ...(queue.ready || []),
    ...(queue.printing || []),
    ...(queue.qc || []),
  ]) {
    pushId(x.orderId);
  }

  for (const o of orders) {
    if (ids.length >= 10) break;
    pushId(o.id);
  }

  const slice = ids.slice(0, 10);
  const rows = [];
  for (const id of slice) {
    const o = byId.get(id);
    if (!o) continue;
    const mem = getMemory(o);
    const notes = Array.isArray(mem.notes) ? mem.notes : [];
    const decisions = Array.isArray(mem.decisions) ? mem.decisions : [];
    const flags = Array.isArray(mem.flags) ? mem.flags : [];
    const latestNote = notes.length ? notes[notes.length - 1] : null;
    const latestDecision = decisions.length
      ? decisions[decisions.length - 1]
      : null;
    const highFlags = flags.filter(
      (f) => f && String(f.severity || "").toLowerCase() === "high"
    );
    const hasMemory =
      notes.length > 0 ||
      decisions.length > 0 ||
      flags.length > 0 ||
      (Array.isArray(mem.history) && mem.history.length > 0);

    const intelligence = analyzeJob({
      customerName: o.customerName,
      quantity: o.quantity,
      productType: inferProductType("", o.product),
      product: o.product,
      printType: o.printType,
      dueText: o.dueDate || "",
      status: o.status,
      paymentStatus: o.paymentStatus || "",
      memory: {
        notes: mem.notes,
        decisions: mem.decisions,
        flags: mem.flags,
        history: mem.history,
      },
      rawText: String(o.paymentNotes || ""),
    });

    rows.push({
      orderId: id,
      customerName: o.customerName,
      product: o.product,
      quantity: o.quantity,
      status: String(o.status || "")
        .trim()
        .toUpperCase(),
      latestNote,
      latestDecision,
      highFlags,
      hasMemory,
      intelligence,
    });
  }
  return rows;
}

async function getFounderDashboardPayload() {
  const [next, auto, queue, orders, autoActions] = await Promise.all([
    getNextAction(),
    getAutoFollowupsResponse(),
    getProductionQueue(),
    fetchCaptureOrders(),
    collectAutomationActions(5),
  ]);

  const paymentBlockers = [];
  const readyForProduction = [];
  const highRisk = [];

  for (const o of orders) {
    const gate = evaluatePaymentGate(captureOrderToGateInput(o));
    const st = String(o.status || "")
      .trim()
      .toUpperCase();

    if (!gate.allowedToProduce && st !== "DONE") {
      paymentBlockers.push({
        orderId: o.id,
        customerName: o.customerName,
        product: o.product,
        quantity: o.quantity,
        status: st,
        gateReason: gate.reason,
        gateStatus: gate.gateStatus,
      });
    }

    if (gate.allowedToProduce && st === "READY") {
      readyForProduction.push({
        orderId: o.id,
        customerName: o.customerName,
        product: o.product,
        quantity: o.quantity,
        printType: o.printType,
        dueDate: o.dueDate || "",
      });
    }

    if (
      ["INTAKE", "QUOTE", "DEPOSIT"].includes(st) &&
      !gate.allowedToProduce
    ) {
      highRisk.push({
        customerName: o.customerName,
        product: o.product,
        quantity: o.quantity,
        status: st,
        hint: gate.reason || "Needs clarification or payment",
      });
    }
  }

  const urgentFollowups = (auto.topActions || [])
    .filter(
      (t) =>
        String(t.priority || "").toLowerCase() === "high" ||
        String(t.priority || "").toLowerCase() === "critical"
    )
    .slice(0, 5);

  const jobMemory = buildJobMemoryRows(
    orders,
    paymentBlockers,
    readyForProduction,
    queue
  );

  return {
    next,
    systemActions: (autoActions && autoActions.actions) || [],
    jobMemory,
    paymentBlockers,
    urgentFollowups,
    readyForProduction,
    highRisk: highRisk.slice(0, 12),
    queue,
  };
}

module.exports = { getFounderDashboardPayload };
