"use strict";

/**
 * Human-readable stuck reasons for production operator layer (additive).
 * Safe: always returns a string array (may be empty).
 */

const STALE_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * @param {Record<string, unknown> & {
 *   status?: string,
 *   depositPaidAt?: Date | null,
 *   depositReceived?: boolean,
 *   depositStatus?: string,
 *   garmentsOrdered?: boolean,
 *   blockedReason?: string | null,
 *   updatedAt?: Date,
 *   garmentType?: string | null,
 *   quantity?: number | null,
 *   productionTypeFinal?: string | null,
 *   printMethod?: string | null,
 *   artFiles?: { approvalStatus?: string }[],
 *   vendorOrders?: { status?: string }[],
 *   lineItems?: unknown[],
 * }} o
 * @returns {string[]}
 */
function computeStuckReasons(o) {
  /** @type {string[]} */
  const reasons = [];
  try {
    const st = String(o.status || "").toUpperCase();
    const hasDeposit = !!o.depositPaidAt;
    const artFiles = Array.isArray(o.artFiles) ? o.artFiles : [];
    const hasApprovedArt = artFiles.some(
      (a) => String(a.approvalStatus || "").toUpperCase() === "APPROVED"
    );
    const lineItems = Array.isArray(o.lineItems) ? o.lineItems : [];
    const hasLineItems = lineItems.length > 0;

    if (!hasDeposit && ["PRODUCTION_READY", "PRINTING", "QC"].includes(st)) {
      reasons.push("Missing depositPaidAt");
    }

    if (
      hasDeposit &&
      (String(o.depositStatus || "") === "NONE" || o.depositReceived === false) &&
      ["DEPOSIT_PAID", "PRODUCTION_READY", "PRINTING", "QC"].includes(st)
    ) {
      reasons.push("Deposit recorded but flags incomplete — verify with Patrick");
    }

    if (st === "PRODUCTION_READY" && o.garmentsOrdered !== true) {
      if (!hasApprovedArt) {
        reasons.push("Missing art approval");
      } else {
        const br = String(o.blockedReason || "").trim();
        if (br) reasons.push("Garment order blocked");
        else reasons.push("Garment order blocked");
      }
    }

    const hasQty = o.quantity != null && Number(o.quantity) > 0;
    if (!hasQty && !hasLineItems && ["PRODUCTION_READY", "PRINTING", "QC"].includes(st)) {
      reasons.push("Missing quantities");
    }

    const hasProduct = !!(o.garmentType && String(o.garmentType).trim()) || hasLineItems;
    if (!hasProduct && ["PRODUCTION_READY", "PRINTING", "QC"].includes(st)) {
      reasons.push("Missing product");
    }

    if (
      !o.productionTypeFinal &&
      !o.printMethod &&
      ["PRODUCTION_READY", "PRINTING", "QC"].includes(st)
    ) {
      reasons.push("Unknown production type");
    }

    const vendorOrders = Array.isArray(o.vendorOrders) ? o.vendorOrders : [];
    if (
      vendorOrders.some((v) =>
        ["HELD", "ERROR", "FAILED", "CANCELLED"].includes(String(v.status || "").toUpperCase())
      )
    ) {
      reasons.push("Garment order blocked (vendor)");
    }

    if (o.updatedAt) {
      const age = Date.now() - new Date(o.updatedAt).getTime();
      if (age > STALE_MS && ["PRODUCTION_READY", "PRINTING", "QC", "WAITING_GARMENTS"].includes(st)) {
        reasons.push("Overdue");
      }
    }

    const blockedUpper = String(o.blockedReason || "").toUpperCase();
    if (blockedUpper.includes("CANCEL")) {
      reasons.push("Order may be cancelled — confirm with Patrick");
    } else if (blockedUpper.includes("ERROR") || blockedUpper.includes("FAIL")) {
      reasons.push("Error flagged — ask Patrick");
    }

    return [...new Set(reasons)];
  } catch (_e) {
    return [];
  }
}

module.exports = { computeStuckReasons, STALE_MS };
