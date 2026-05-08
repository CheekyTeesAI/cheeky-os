"use strict";

/**
 * Production Routing Rules
 * Extends the existing productionRoutingService logic with:
 *   - Garment-type rules (POLY→DTF, TRIBLEND→DTG, 50/50→DTG/DTF)
 *   - Deadline-based outsource logic (short=in-house, long=outsource allowed)
 *   - Square Sync payment gate (deposit required)
 *
 * REUSE FIRST: calls decideBaseRoute from existing dist/services/productionRoutingService
 * IRON LAW: No deposit = BLOCKED (never bypass)
 */

const path = require("path");

// ─── Assignees ───────────────────────────────────────────────────────────────
const ASSIGNEES = {
  JEREMY: "Jeremy",       // in-house DTG/DTF operator
  CHARLENE: "Charlene",   // in-house backup / overflow
  BULLSEYE: "Bullseye",   // screen print vendor
  OWNER: "Patrick",       // vendor management / oversight
};

const METHODS = {
  DTG: "DTG",
  DTF: "DTF",
  SCREEN: "SCREEN_PRINT",
  VENDOR: "VENDOR",
  EMB: "EMBROIDERY",
  VINYL: "VINYL",
};

// ─── Minimums ─────────────────────────────────────────────────────────────────
const MIN_QTY = {
  DTG: 12,
  DTF: 12,
  SCREEN: 24,
  EMB: 12,
  VINYL: 1,
};

// ─── Deadline thresholds ──────────────────────────────────────────────────────
const SHORT_DEADLINE_DAYS = 7;   // ≤7 days → prefer in-house
const LONG_DEADLINE_DAYS = 14;   // >14 days → outsource allowed

// ─── Garment material type → preferred method ──────────────────────────────────
const MATERIAL_ROUTE = {
  "100% POLY": METHODS.DTF,
  "POLY": METHODS.DTF,
  "POLYESTER": METHODS.DTF,
  "PERFORMANCE": METHODS.DTF,
  "TRIBLEND": METHODS.DTG,
  "TRI-BLEND": METHODS.DTG,
  "TRI BLEND": METHODS.DTG,
  "50/50": METHODS.DTG,           // prefer DTG, DTF fallback if qty low
  "50 50": METHODS.DTG,
  "COTTON": null,                  // no override — let print method decide
  "RINGSPUN": null,
};

/**
 * Normalize printMethod string to a canonical method code.
 * @param {string|null} raw
 * @returns {string|null}
 */
function normalizePrintMethod(raw) {
  if (!raw) return null;
  const u = String(raw).toUpperCase().trim();
  if (u.includes("SCREEN")) return "SCREEN";
  if (u.includes("DTF")) return "DTF";
  if (u.includes("DTG")) return "DTG";
  if (u.includes("EMBROID") || u === "EMB") return "EMB";
  if (u.includes("VINYL") || u.includes("HTV")) return "VINYL";
  return null;
}

/**
 * Determine method from garment type + quantity.
 * @param {string|null} garmentType
 * @param {number} qty
 * @returns {{ method: string|null, reason: string }}
 */
function getMethodFromMaterial(garmentType, qty) {
  if (!garmentType) return { method: null, reason: "No garment type specified." };
  const key = String(garmentType).toUpperCase().trim();

  for (const [mat, method] of Object.entries(MATERIAL_ROUTE)) {
    if (key.includes(mat)) {
      if (!method) return { method: null, reason: `${mat} material — print method determines route.` };

      // 50/50 can go DTF if qty is below DTG min
      if ((mat === "50/50" || mat === "50 50") && qty < MIN_QTY.DTG) {
        return { method: METHODS.DTF, reason: `50/50 blend with low qty (${qty}) — routed to DTF.` };
      }

      return { method, reason: `${mat} garment type → ${method} (material routing rule).` };
    }
  }
  return { method: null, reason: "Garment type not in material map — using print method." };
}

/**
 * Check if a deadline is "short" (prefer in-house) or "long" (outsource allowed).
 * @param {Date|string|null} dueDate
 * @returns {{ isShort: boolean, isLong: boolean, daysRemaining: number|null }}
 */
function analyzeDeadline(dueDate) {
  if (!dueDate) return { isShort: false, isLong: true, daysRemaining: null };
  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return { isShort: false, isLong: true, daysRemaining: null };
  const now = new Date();
  const daysRemaining = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return {
    isShort: daysRemaining <= SHORT_DEADLINE_DAYS,
    isLong: daysRemaining > LONG_DEADLINE_DAYS,
    daysRemaining,
  };
}

/**
 * Core routing decision for a single order.
 * Applies garment type rules first, then print method, then deadline modifiers.
 *
 * @param {object} order - Prisma Order row
 * @returns {{ method: string, assignee: string, reason: string, confidence: string, outsource: boolean }}
 */
function determineProductionRoute(order) {
  const qty = Number(order.quantity || 0);
  const printMethod = normalizePrintMethod(order.printMethod);
  const notes = String(order.notes || "").toLowerCase();
  const isRush = Boolean(order.isRush) || notes.includes("rush");
  const wantsOutsource = notes.includes("outsource") || notes.includes("vendor");

  const deadline = analyzeDeadline(order.completedAt || order.updatedAt);
  const forceInHouse = isRush || deadline.isShort;
  const outsourceAllowed = !forceInHouse && (wantsOutsource || deadline.isLong);

  // 1. Try garment material rule first
  const matResult = getMethodFromMaterial(order.garmentType, qty);

  let method = matResult.method;
  let reason = matResult.reason;
  let confidence = "medium";

  // 2. Fall back to print method
  if (!method && printMethod) {
    method = printMethod;
    reason = `Routed by print method: ${printMethod}.`;
    confidence = "high";
  }

  // 3. Quantity minimum enforcement
  if (method === "SCREEN" && qty < MIN_QTY.SCREEN) {
    method = "DTF";
    reason = `Screen print requires ≥${MIN_QTY.SCREEN} pieces (order has ${qty}). Downgraded to DTF.`;
    confidence = "high";
  }
  if ((method === "DTG" || method === "DTF" || method === "EMB") && qty < MIN_QTY[method]) {
    reason += ` Low qty (${qty}) — may need manual review.`;
    confidence = "low";
  }

  // 4. Ultimate fallback
  if (!method) {
    method = qty >= MIN_QTY.SCREEN ? "DTF" : "DTG";
    reason = `No print method or garment type — defaulted to ${method}.`;
    confidence = "low";
  }

  // 5. Assign operator
  let assignee;
  let outsource = false;

  if (method === "SCREEN" || method === "EMB") {
    if (outsourceAllowed && !forceInHouse) {
      assignee = ASSIGNEES.BULLSEYE;
      outsource = true;
      reason += ` Routed to Bullseye (outsource).`;
    } else {
      assignee = ASSIGNEES.BULLSEYE;
      outsource = true;
      reason += ` Bullseye handles all screen print / embroidery.`;
    }
  } else if (method === "VENDOR") {
    assignee = ASSIGNEES.BULLSEYE;
    outsource = true;
  } else {
    // DTG / DTF — in-house by default
    if (outsourceAllowed && !isRush && !forceInHouse && wantsOutsource) {
      assignee = ASSIGNEES.BULLSEYE;
      outsource = true;
      reason += ` Outsource requested and deadline allows it.`;
    } else {
      assignee = ASSIGNEES.JEREMY;
      if (isRush) reason += ` Rush — assigned to Jeremy (in-house priority).`;
      if (forceInHouse && !isRush) reason += ` Short deadline — in-house with Jeremy.`;
    }
  }

  return { method, assignee, reason, confidence, outsource, qty };
}

/**
 * Check if an order is production eligible (deposit/payment verified).
 * IRON LAW: deposit required.
 * @param {object} order
 * @returns {{ eligible: boolean, blocked: boolean, reason: string }}
 */
function checkProductionEligibility(order) {
  // Check Square Sync guardrails if available
  try {
    const guardrails = require(path.join(__dirname, "..", "squareSync", "squareSync.guardrails"));
    return guardrails.getProductionEligibility(order);
  } catch (_) {}

  // Fallback: local deposit check
  const paid = Number(order.amountPaid || 0);
  const depositPaid = Boolean(order.depositPaid || order.depositReceived);
  const depositStatus = String(order.depositStatus || "NONE");

  if (depositPaid || depositStatus === "PAID" || paid > 0) {
    return {
      eligible: true,
      blocked: false,
      reason: depositPaid ? "Deposit marked paid." : `Amount paid: $${paid}.`,
      source: "production-routing",
    };
  }

  return {
    eligible: false,
    blocked: true,
    reason: "No deposit or payment verified. Production blocked until deposit is collected.",
    source: "production-routing",
  };
}

/**
 * Get tasks template for a given production method.
 * @param {string} method
 * @returns {Array<{title: string, type: string, status: string}>}
 */
function getTasksForMethod(method) {
  const PENDING = "PENDING";
  switch (String(method || "").toUpperCase()) {
    case "DTG":
      return [
        { title: "Pretreat garments", type: "DTG_PRETREAT", status: PENDING },
        { title: "Print (DTG)", type: "DTG_PRINT", status: PENDING },
        { title: "Heat press / cure", type: "DTG_PRESS", status: PENDING },
        { title: "QC check", type: "QC", status: PENDING },
      ];
    case "DTF":
      return [
        { title: "Print DTF film", type: "DTF_PRINT", status: PENDING },
        { title: "Powder and cure film", type: "DTF_CURE", status: PENDING },
        { title: "Heat press to garment", type: "DTF_PRESS", status: PENDING },
        { title: "QC check", type: "QC", status: PENDING },
      ];
    case "SCREEN":
    case "SCREEN_PRINT":
      return [
        { title: "Art check and approval", type: "ART_CHECK", status: PENDING },
        { title: "Screen setup / burn screens", type: "SCREEN_SETUP", status: PENDING },
        { title: "Print run", type: "SCREEN_PRINT_RUN", status: PENDING },
        { title: "Flash cure between colors", type: "SCREEN_CURE", status: PENDING },
        { title: "QC and folding", type: "QC", status: PENDING },
      ];
    case "EMB":
    case "EMBROIDERY":
      return [
        { title: "Submit digitizing request", type: "EMB_DIGITIZE", status: PENDING },
        { title: "Confirm digitizing file received", type: "EMB_FILE_CHECK", status: PENDING },
        { title: "Run embroidery production", type: "EMB_RUN", status: PENDING },
        { title: "QC check", type: "QC", status: PENDING },
      ];
    case "VENDOR":
      return [
        { title: "Prepare vendor order packet", type: "VENDOR_PACKET", status: PENDING },
        { title: "Send to Bullseye / vendor", type: "VENDOR_SEND", status: PENDING },
        { title: "Confirm vendor received order", type: "VENDOR_CONFIRM", status: PENDING },
        { title: "Check vendor production status", type: "VENDOR_STATUS", status: PENDING },
      ];
    default:
      return [
        { title: "Review order and assign production method", type: "MANUAL_REVIEW", status: PENDING },
        { title: "QC check", type: "QC", status: PENDING },
      ];
  }
}

module.exports = {
  determineProductionRoute,
  checkProductionEligibility,
  getTasksForMethod,
  normalizePrintMethod,
  getMethodFromMaterial,
  analyzeDeadline,
  ASSIGNEES,
  METHODS,
  MIN_QTY,
};
