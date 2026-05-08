"use strict";

/**
 * Canonical order lifecycle (Cheeky Tees v8 — operational baseline).
 * DB may use narrower status strings; map via orderWorkflowRules.deriveCanonicalStageFromOrder.
 */

const ORDER_STAGES = [
  "INTAKE",
  "ESTIMATE_SENT",
  "INVOICE_SENT",
  "AWAITING_DEPOSIT",
  "DEPOSIT_PAID",
  "ART_CHECK",
  "ART_NEEDED",
  "DIGITIZING",
  "EVALUATE_APPROVE",
  "ON_HOLD",
  "APPROVED_FOR_PRODUCTION",
  "WORK_ORDER_CREATED",
  "GARMENTS_NEEDED",
  "GARMENTS_ORDERED",
  "GARMENTS_RECEIVED",
  "PRODUCTION_READY",
  "IN_PRODUCTION",
  "QC",
  "READY_FOR_PICKUP",
  "AWAITING_REMAINING_PAYMENT",
  "COMPLETED",
];

const STAGES = ORDER_STAGES;

const MAIN_PATH = [
  "INTAKE",
  "ESTIMATE_SENT",
  "INVOICE_SENT",
  "AWAITING_DEPOSIT",
  "DEPOSIT_PAID",
  "ART_CHECK",
  "EVALUATE_APPROVE",
  "APPROVED_FOR_PRODUCTION",
  "WORK_ORDER_CREATED",
  "GARMENTS_NEEDED",
  "GARMENTS_ORDERED",
  "GARMENTS_RECEIVED",
  "PRODUCTION_READY",
  "IN_PRODUCTION",
  "QC",
  "READY_FOR_PICKUP",
  "AWAITING_REMAINING_PAYMENT",
  "COMPLETED",
];

/** @type {Record<string, Set<string>>} */
const TRANSITIONS = {};

function addEdge(from, to) {
  if (!TRANSITIONS[from]) TRANSITIONS[from] = new Set();
  TRANSITIONS[from].add(to);
}

function pathEdges() {
  for (let i = 0; i < MAIN_PATH.length - 1; i++) {
    addEdge(MAIN_PATH[i], MAIN_PATH[i + 1]);
  }
}

function branchEdges() {
  const hold = "ON_HOLD";
  STAGES.forEach((s) => {
    if (s !== hold && s !== "COMPLETED") addEdge(s, hold);
  });
  addEdge(hold, "ART_CHECK");
  addEdge(hold, "EVALUATE_APPROVE");
  addEdge(hold, "GARMENTS_NEEDED");
  addEdge(hold, "PRODUCTION_READY");

  addEdge("ART_CHECK", "ART_NEEDED");
  addEdge("ART_NEEDED", "DIGITIZING");
  addEdge("DIGITIZING", "ART_CHECK");
  addEdge("ART_NEEDED", "ART_CHECK");
  addEdge("DEPOSIT_PAID", "DIGITIZING");

  addEdge("ESTIMATE_SENT", "INVOICE_SENT");
  addEdge("INVOICE_SENT", "AWAITING_DEPOSIT");
  addEdge("AWAITING_DEPOSIT", "DEPOSIT_PAID");
  addEdge("EVALUATE_APPROVE", "APPROVED_FOR_PRODUCTION");
  addEdge("APPROVED_FOR_PRODUCTION", "WORK_ORDER_CREATED");
  addEdge("WORK_ORDER_CREATED", "GARMENTS_NEEDED");
  addEdge("GARMENTS_ORDERED", "GARMENTS_RECEIVED");
  addEdge("GARMENTS_RECEIVED", "PRODUCTION_READY");
  addEdge("READY_FOR_PICKUP", "AWAITING_REMAINING_PAYMENT");
  addEdge("AWAITING_REMAINING_PAYMENT", "COMPLETED");
  addEdge("READY_FOR_PICKUP", "COMPLETED");
}

pathEdges();
branchEdges();

/**
 * @param {{ depositPaid?: boolean, artApproved?: boolean, workOrderCreated?: boolean, garmentsReady?: boolean }} gates
 */
function productionReadyGatesSatisfied(gates) {
  const g = gates || {};
  return !!(g.depositPaid && g.artApproved && g.workOrderCreated && g.garmentsReady);
}

/**
 * @param {string} from
 * @param {string} to
 * @param {{ depositPaid?: boolean, artApproved?: boolean, workOrderCreated?: boolean, garmentsReady?: boolean }} [ctx]
 * @returns {{ ok: boolean, reason?: string }}
 */
function canTransition(from, to, ctx) {
  const a = String(from || "").toUpperCase();
  const b = String(to || "").toUpperCase();
  if (!STAGES.includes(a) || !STAGES.includes(b)) {
    return { ok: false, reason: "unknown_stage" };
  }
  if (a === b) return { ok: true };

  const set = TRANSITIONS[a];
  if (!set || !set.has(b)) {
    return { ok: false, reason: "transition_not_allowed" };
  }

  if (b === "PRODUCTION_READY") {
    const gates = ctx || {};
    if (!productionReadyGatesSatisfied(gates)) {
      return {
        ok: false,
        reason: "production_ready_requires_deposit_art_workorder_garments",
      };
    }
  }

  return { ok: true };
}

/**
 * @param {string} stage
 * @param {{ depositPaid?: boolean, artApproved?: boolean, workOrderCreated?: boolean, garmentsReady?: boolean }} [ctx]
 */
function allowedNextStages(stage, ctx) {
  const a = String(stage || "").toUpperCase();
  const set = TRANSITIONS[a];
  if (!set) return [];
  const out = Array.from(set);
  if (!ctx) return out;
  return out.filter((t) => canTransition(a, t, ctx).ok);
}

module.exports = {
  ORDER_STAGES,
  STAGES,
  MAIN_PATH,
  TRANSITIONS,
  productionReadyGatesSatisfied,
  canTransition,
  allowedNextStages,
};
