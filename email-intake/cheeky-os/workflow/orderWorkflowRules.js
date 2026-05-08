"use strict";

const sm = require("./orderStateMachine");

/**
 * Non-negotiable operating rules (Square truth, gates, Carolina Made primary vendor).
 */
const CORE_BUSINESS_RULES = [
  "Square is the financial source of truth.",
  "Deposit/payment check gates production; payment alone does not approve production.",
  "Art must be checked before production; missing/bad art → digitizer/designer; unresolved → HOLD.",
  "Approved path: work order → garment order (deposit required) → production.",
  "Carolina Made is the primary garment vendor; other vendors (S&S, SanMar, AlphaBroder, ShirtSpace, Delta, Brisco) are secondary.",
  "No auto-send email, no auto garment order, no Square mutations without explicit approval.",
];

function artIsApproved(order) {
  try {
    const ac = String(order.artApprovalStatus || "NOT_REQUESTED").toUpperCase();
    if (ac === "APPROVED") return true;
    if (order.proofApprovedAt) return true;
    if (order.artApprovedAt) return true;
    return false;
  } catch (_e) {
    return false;
  }
}

function workOrderCreated(order) {
  return !!(order.workOrderNumber || order.jobCreated || String(order.workOrderStatus || "").trim());
}

function garmentsReady(order) {
  return !!(order.garmentsReceived && order.garmentsOrdered);
}

function depositPaid(order) {
  return !!(
    order.depositPaid ||
    order.depositReceived ||
    String(order.depositStatus || "").toUpperCase() === "PAID"
  );
}

/**
 * Snapshot for state machine PRODUCTION_READY guard.
 * @param {object} order
 */
function productionGateSnapshot(order) {
  const o = order || {};
  return {
    depositPaid: depositPaid(o),
    artApproved: artIsApproved(o),
    workOrderCreated: workOrderCreated(o),
    garmentsReady: garmentsReady(o),
  };
}

function needsDigitizing(order) {
  const o = order || {};
  if (o.digitizingRequired) {
    const ds = String(o.digitizingStatus || "").toUpperCase();
    if (ds && ds !== "COMPLETE" && ds !== "COMPLETED" && ds !== "DONE") return true;
  }
  return false;
}

/**
 * Best-effort canonical stage for dashboard / operator (Prisma Order row).
 * @param {object} order
 * @returns {string}
 */
function deriveCanonicalStageFromOrder(order) {
  const o = order || {};
  const st = String(o.status || "INTAKE").toUpperCase();

  if (o.completedAt || st === "COMPLETED") return "COMPLETED";
  if (o.readyForPickup || st === "READY") return "READY_FOR_PICKUP";
  if (st === "QC") return "QC";
  if (st === "PRINTING") return "IN_PRODUCTION";
  if (st === "PRODUCTION_READY") return "PRODUCTION_READY";

  if (o.blockedReason && String(o.blockedReason).trim()) return "ON_HOLD";

  if (needsDigitizing(o)) return "DIGITIZING";

  const artSt = String(o.artFileStatus || "").toLowerCase();
  if (/missing|needed|required/i.test(artSt) && !artIsApproved(o)) return "ART_NEEDED";

  if (!artIsApproved(o) && (o.proofRequired || o.artFiles?.length)) return "ART_CHECK";

  if (depositPaid(o) && o.isApproved && workOrderCreated(o) && garmentsReady(o) && !["PRINTING", "QC"].includes(st)) {
    return "PRODUCTION_READY";
  }

  if (depositPaid(o) && o.garmentsOrdered && !o.garmentsReceived) return "GARMENTS_ORDERED";
  if (depositPaid(o) && o.garmentOrderNeeded !== false && !o.garmentsOrdered) return "GARMENTS_NEEDED";

  if (workOrderCreated(o) && depositPaid(o)) return "WORK_ORDER_CREATED";
  if (o.isApproved && depositPaid(o) && artIsApproved(o)) return "APPROVED_FOR_PRODUCTION";

  if (!o.isApproved && depositPaid(o) && artIsApproved(o)) return "EVALUATE_APPROVE";

  if (depositPaid(o)) return "DEPOSIT_PAID";

  if (o.squareInvoicePublished || o.squareInvoiceId) {
    if (!depositPaid(o)) return "AWAITING_DEPOSIT";
    return "INVOICE_SENT";
  }

  if (o.estimates?.length || st === "QUOTED") return "ESTIMATE_SENT";

  return "INTAKE";
}

/**
 * @param {object} order
 * @returns {{ ok: boolean, blockers: string[], gates: object, nextStageIfReady: string }}
 */
function evaluateProductionReadyTransition(order) {
  const gates = productionGateSnapshot(order);
  const check = sm.canTransition(deriveCanonicalStageFromOrder(order), "PRODUCTION_READY", gates);
  const blockers = [];
  if (!gates.depositPaid) blockers.push("deposit_not_recorded");
  if (!gates.artApproved) blockers.push("art_not_approved");
  if (!gates.workOrderCreated) blockers.push("work_order_missing");
  if (!gates.garmentsReady) blockers.push("garments_not_ready");
  return {
    ok: check.ok,
    blockers: check.ok ? [] : blockers,
    gates,
    nextStageIfReady: "PRODUCTION_READY",
  };
}

module.exports = {
  CORE_BUSINESS_RULES,
  artIsApproved,
  workOrderCreated,
  garmentsReady,
  depositPaid,
  productionGateSnapshot,
  deriveCanonicalStageFromOrder,
  evaluateProductionReadyTransition,
};
