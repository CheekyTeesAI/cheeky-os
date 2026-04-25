"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Production transitions audited: PRODUCTION_READY, PRINTING
// - Deposit truth guard: src/services/depositGate.js (depositPaidAt required)

let _prisma = null;
const { canEnterProduction } = require("./depositGate");

function getPrisma() {
  try {
    if (global.__CHEEKY_PRISMA__) return global.__CHEEKY_PRISMA__;
    if (!_prisma) {
      const { PrismaClient } = require("@prisma/client");
      _prisma = new PrismaClient();
      global.__CHEEKY_PRISMA__ = _prisma;
    }
    return _prisma;
  } catch (e) {
    console.error("[decisionEngine] Prisma unavailable:", e && e.stack ? e.stack : e);
    return null;
  }
}

/**
 * Map persisted Order row to the shape expected by evaluateOrderState (depositPaid boolean, etc.).
 */
function normalizeForDecision(order) {
  if (!order || typeof order !== "object") return order;
  const depositPaid =
    order.depositReceived === true ||
    (typeof order.depositPaid === "number" && order.depositPaid > 0) ||
    order.depositStatus === "PAID";
  return {
    ...order,
    depositPaid,
    garmentsOrdered: order.garmentsOrdered === true || !!order.garmentOrderPlacedAt,
    garmentsReceived: order.garmentsReceived === true || !!order.garmentOrderReceivedAt,
    productionComplete: order.productionComplete === true,
    qcComplete: order.qcComplete === true,
    artFiles: Array.isArray(order.artFiles) ? order.artFiles : [],
  };
}

/**
 * Core brain — Cheeky OS v3.3 (normalized order required for depositPaid boolean).
 * Square / DB may store amounts in depositPaid (Float); normalizeForDecision yields boolean truthiness.
 */
function evaluateOrderState(order) {
  const hasApprovedArt = order.artFiles?.some((a) => a.approvalStatus === "APPROVED");
  const productionAllowed = canEnterProduction(order);

  if (!order.depositPaid || !productionAllowed) {
    return {
      status: "DEPOSIT_PENDING",
      nextAction: "Collect deposit",
      nextOwner: "Cheeky",
      blockedReason: productionAllowed ? "WAITING_ON_DEPOSIT" : "WAITING_ON_VERIFIED_DEPOSIT",
    };
  }

  if (!order.garmentsOrdered) {
    return {
      status: "PRODUCTION_READY",
      nextAction: "Order garments",
      nextOwner: "Jeremy",
      blockedReason: null,
    };
  }

  if (order.garmentsOrdered && !order.garmentsReceived) {
    return {
      status: "WAITING_GARMENTS",
      nextAction: "Waiting for garments",
      nextOwner: "System",
      blockedReason: null,
    };
  }

  if (!hasApprovedArt) {
    return {
      status: "WAITING_ART",
      nextAction: "Approve art",
      nextOwner: "Cheeky",
      blockedReason: "ART_NOT_APPROVED",
    };
  }

  if (order.garmentsReceived && !order.productionComplete) {
    return {
      status: "PRINTING",
      nextAction: "Run production",
      nextOwner: "Jeremy",
      blockedReason: null,
    };
  }

  if (order.productionComplete && !order.qcComplete) {
    return {
      status: "QC",
      nextAction: "Quality check",
      nextOwner: "Jeremy",
      blockedReason: null,
    };
  }

  if (order.qcComplete) {
    return {
      status: "READY_FOR_PICKUP",
      nextAction: "Notify customer",
      nextOwner: "Cheeky",
      blockedReason: null,
    };
  }

  return {
    status: "UNKNOWN",
    nextAction: "Manual review",
    nextOwner: "Cheeky",
    blockedReason: "UNHANDLED_STATE",
  };
}

const DECISION_TO_ORDER_STATUS = {
  DEPOSIT_PENDING: "AWAITING_DEPOSIT",
  PRODUCTION_READY: "PRODUCTION_READY",
  WAITING_GARMENTS: "WAITING_GARMENTS",
  WAITING_ART: "WAITING_ART",
  PRINTING: "PRINTING",
  QC: "QC",
  READY_FOR_PICKUP: "READY",
  UNKNOWN: "UNKNOWN",
};

function mapDecisionToPrismaStatus(decisionStatus) {
  return DECISION_TO_ORDER_STATUS[decisionStatus] || "UNKNOWN";
}

/**
 * Re-fetch full order, evaluate, persist status + next fields — MUST run inside the same transaction
 * after any state change to Order / payments / garments / art / tasks.
 */
async function runDecisionEngineInTransaction(tx, orderId) {
  const id = String(orderId || "").trim();
  if (!id) {
    throw new Error("ORDER_ID_REQUIRED");
  }
  const full = await tx.order.findUnique({
    where: { id },
    include: {
      artFiles: true,
      lineItems: true,
      customer: true,
      tasks: true,
    },
  });
  if (!full) {
    throw new Error("ORDER_NOT_FOUND");
  }
  const normalized = normalizeForDecision(full);
  const d = evaluateOrderState(normalized);
  const prismaStatus = mapDecisionToPrismaStatus(d.status);
  return tx.order.update({
    where: { id },
    data: {
      status: prismaStatus,
      nextAction: d.nextAction,
      nextOwner: d.nextOwner,
      blockedReason: d.blockedReason,
    },
    include: {
      artFiles: true,
      lineItems: true,
      customer: true,
      tasks: true,
    },
  });
}

module.exports = {
  getPrisma,
  normalizeForDecision,
  evaluateOrderState,
  mapDecisionToPrismaStatus,
  runDecisionEngineInTransaction,
};
