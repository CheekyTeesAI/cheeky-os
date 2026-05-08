"use strict";

const { normalizePaymentStatus } = require("../utils/statusNormalizer");

/**
 * Production mode — canonical order stages (operator transitions; webhook sets DEPOSIT_PAID only).
 */

const ORDER_STAGES = [
  "INTAKE",
  "QUOTE_SENT",
  "DEPOSIT_PAID",
  "PRODUCTION_READY",
  "PRINTING",
  "QC",
  "COMPLETED",
];

/** @type {Record<string, string[]>} */
const OPERATOR_EDGES = {
  INTAKE: ["QUOTE_SENT"],
  QUOTE_SENT: ["DEPOSIT_PAID"],
  AWAITING_DEPOSIT: ["DEPOSIT_PAID", "PRODUCTION_READY"],
  DEPOSIT_PAID: ["PRODUCTION_READY"],
  PRODUCTION_READY: ["PRINTING"],
  PRINTING: ["QC"],
  QC: ["COMPLETED"],
};

const LEGACY_MAP = {
  AWAITING_DEPOSIT: "QUOTE_SENT",
  APPROVED: "QUOTE_SENT",
  QUOTE_READY: "QUOTE_SENT",
  PAID_IN_FULL: "COMPLETED",
  PRODUCTION: "PRINTING",
};

function normalizeStage(raw) {
  const s = String(raw || "").toUpperCase().trim();
  if (ORDER_STAGES.includes(s)) return s;
  if (LEGACY_MAP[s]) return LEGACY_MAP[s];
  return s;
}

function isDepositSatisfied(order) {
  const st = String(order.status || "").toUpperCase();
  if (st === "PAID_IN_FULL") return true;
  if (order.depositStatus === "PAID") return true;
  if (order.depositPaid === true) return true;
  const req = Number(order.depositRequired || order.depositAmount || 0);
  const paid = Number(order.amountPaid || 0);
  if (req > 0 && paid + 1e-6 >= req) return true;
  const tot = Number(order.totalAmount || order.quotedAmount || order.total || 0);
  if (tot > 0 && paid + 1e-6 >= tot * 0.5) return true;
  return false;
}

/**
 * @param {string} fromNormalized
 * @param {string} toNormalized
 * @param {object} order
 * @returns {{ ok: boolean, reason?: string }}
 */
function assertOperatorStageTransition(fromNormalized, toNormalized, order) {
  const fromRaw = String(fromNormalized || "").toUpperCase().trim();
  const to = normalizeStage(toNormalized);
  if (!ORDER_STAGES.includes(to)) {
    return { ok: false, reason: `Invalid stage "${to}". Allowed: ${ORDER_STAGES.join(", ")}` };
  }
  const allowed = OPERATOR_EDGES[fromRaw] || [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `Transition not allowed: ${fromRaw} → ${to}. Allowed from ${fromRaw}: ${allowed.join(", ") || "(none)"}`,
    };
  }
  const productionFacing = new Set(["PRODUCTION_READY", "PRINTING", "QC"]);
  const cashHeavy = new Set(["PRODUCTION_READY", "PRINTING", "QC", "COMPLETED"]);

  if (cashHeavy.has(to)) {
    if (order.isDepositWaived === true) {
      return { ok: true };
    }
    const ps = normalizePaymentStatus(order.paymentStatus);
    const paidLane = ["DEPOSIT_PAID", "PARTIALLY_PAID", "PAID"].includes(ps);
    const cashOk = !!order.depositPaidAt || paidLane || isDepositSatisfied(order);
    if (!cashOk) {
      if (productionFacing.has(to)) {
        console.warn(
          "[DEPOSIT_GATE][BLOCKED] paymentStatus=" + String(order.paymentStatus || "") + " normalized=" + ps
        );
        return { ok: false, reason: "Deposit required before production." };
      }
      return { ok: false, reason: "Deposit must be satisfied before this stage" };
    }
  }
  return { ok: true };
}

function logStageChange(orderId, fromStage, toStage, actor) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    orderId,
    from: fromStage,
    to: toStage,
    actor: actor || "operator",
    tag: "stage-engine",
  });
  console.log(`[stage-engine] ${line}`);
}

module.exports = {
  ORDER_STAGES,
  OPERATOR_EDGES,
  normalizeStage,
  assertOperatorStageTransition,
  isDepositSatisfied,
  logStageChange,
};
