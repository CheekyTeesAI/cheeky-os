"use strict";

/**
 * Vendor selection — heuristics only; no external API required.
 */

const CAROLINA_MADE = "Carolina Made";
const SS_ACTIVEWEAR = "S&S Activewear";
const BULLSEYE = "Bullseye";
const MANUAL_REVIEW = "MANUAL_REVIEW";

const PREFERRED_LOCAL = String(process.env.CHEEKY_VENDOR_PREFERRED_LOCAL || CAROLINA_MADE).trim() || CAROLINA_MADE;

/**
 * @param {object} item - normalized line item { product, sku, color, size, quantity, vendorName?, productionType? }
 * @returns {{ vendorName: string, confidence: string, reason: string, requiresManualReview: boolean }}
 */
function selectVendorForItem(item) {
  const it = item && typeof item === "object" ? item : {};
  const existing = String(it.vendorName || "").trim();
  if (existing && existing.toUpperCase() !== "UNKNOWN") {
    return {
      vendorName: existing,
      confidence: "HIGH",
      reason: "vendor_name_on_item",
      requiresManualReview: false,
    };
  }

  const desc = String(it.product || it.description || "").toLowerCase();
  const sku = String(it.sku || "").toLowerCase();
  const prodType = String(it.productionType || "").toLowerCase();

  if (/bullseye|outsource.*print|contract.*screen/i.test(desc) || /bullseye/i.test(sku)) {
    return {
      vendorName: BULLSEYE,
      confidence: "LOW",
      reason: "keyword_outsource_print — confirm if blanks only",
      requiresManualReview: true,
    };
  }

  if (/carolina|local.*blank|cm\s*made/i.test(desc) || /carolina/i.test(sku)) {
    return {
      vendorName: CAROLINA_MADE,
      confidence: "MEDIUM",
      reason: "keyword_local_preferred",
      requiresManualReview: false,
    };
  }

  if (/ss\s*active|s&s|sanmar|alphabroder|wholesale/i.test(desc)) {
    return {
      vendorName: SS_ACTIVEWEAR,
      confidence: "MEDIUM",
      reason: "keyword_wholesale_apparel",
      requiresManualReview: false,
    };
  }

  // Default: prefer configured local blank source, then S&S
  if (prodType.includes("embroid") || prodType.includes("screen") || prodType.includes("print")) {
    return {
      vendorName: PREFERRED_LOCAL,
      confidence: "MEDIUM",
      reason: "production_type_apparel_default_local_first",
      requiresManualReview: false,
    };
  }

  if (!desc && !sku) {
    return {
      vendorName: MANUAL_REVIEW,
      confidence: "LOW",
      reason: "missing_product_sku",
      requiresManualReview: true,
    };
  }

  return {
    vendorName: PREFERRED_LOCAL,
    confidence: "LOW",
    reason: "default_preferred_blank_vendor",
    requiresManualReview: true,
  };
}

module.exports = {
  selectVendorForItem,
  CAROLINA_MADE,
  SS_ACTIVEWEAR,
  BULLSEYE,
  MANUAL_REVIEW,
};
