"use strict";

/**
 * CHEEKY QUOTE ENGINE v1.0
 * Pure functional — no DB, no external calls, no Square.
 * All pricing loaded from config/pricing.json.
 */

const path = require("path");
const crypto = require("crypto");

// Load pricing config once at module init. Throws at startup if missing — intentional.
const PRICING = JSON.parse(
  require("fs").readFileSync(
    path.join(__dirname, "../../config/pricing.json"),
    "utf8"
  )
);

// In-memory pending quote store (Phase 8 only — no DB yet).
const _pendingQuotes = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveQuantityTier(quantity) {
  const q = Math.max(1, parseInt(String(quantity || "1"), 10) || 1);
  const tier = PRICING.quantityTiers.find(
    (t) => q >= t.min && (t.max === null || q <= t.max)
  );
  if (!tier) throw new Error(`No pricing tier found for quantity: ${q}`);
  return { tier, quantity: q };
}

function resolvePrintMultiplier(printMethod) {
  const key = String(printMethod || "DTG").trim();
  const multiplier = PRICING.printMethodMultipliers[key];
  if (multiplier === undefined) {
    throw new Error(
      `Unknown printMethod "${key}". Valid: ${Object.keys(PRICING.printMethodMultipliers).join(", ")}`
    );
  }
  return { key, multiplier };
}

function resolveTurnaroundMultiplier(turnaround) {
  const key = String(turnaround || "standard").trim();
  const multiplier = PRICING.turnaroundMultipliers[key];
  if (multiplier === undefined) {
    throw new Error(
      `Unknown turnaround "${key}". Valid: ${Object.keys(PRICING.turnaroundMultipliers).join(", ")}`
    );
  }
  return { key, multiplier };
}

function resolveTierDiscount(customerTier) {
  const key = String(customerTier || "NEW").trim().toUpperCase();
  const discount = PRICING.customerTierDiscounts[key];
  if (discount === undefined) {
    throw new Error(
      `Unknown customerTier "${key}". Valid: ${Object.keys(PRICING.customerTierDiscounts).join(", ")}`
    );
  }
  return { key, discount };
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// CHEEKY_buildQuote
// ---------------------------------------------------------------------------

/**
 * Builds a deterministic quote from structured input.
 *
 * @param {object} input
 * @param {string} input.itemType      - Description of the item (e.g. "Gildan 5000 T-Shirt")
 * @param {number} input.quantity      - Number of units
 * @param {string} input.printMethod   - DTG | DTF | Screen | HeatPress
 * @param {string} input.turnaround    - standard | rush48 | rush24
 * @param {string} input.customerTier  - NEW | REPEAT | VIP | WHOLESALE
 *
 * @returns {{ ok: boolean, success: boolean, stage: string, data: object } | { ok: false, error: string, code: string }}
 */
function CHEEKY_buildQuote(input) {
  try {
    const raw = input && typeof input === "object" ? input : {};

    const itemType = String(raw.itemType || "Custom Item").trim();
    const { tier, quantity } = resolveQuantityTier(raw.quantity);
    const { key: printKey, multiplier: printMult } = resolvePrintMultiplier(raw.printMethod);
    const { key: turnaroundKey, multiplier: turnaroundMult } = resolveTurnaroundMultiplier(raw.turnaround);
    const { key: tierKey, discount } = resolveTierDiscount(raw.customerTier);

    // Price per unit before discount
    const unitPriceRaw = tier.basePrice * printMult * turnaroundMult;

    // Discount applied per unit
    const unitDiscount = round2(unitPriceRaw * discount);
    const unitPrice = round2(unitPriceRaw - unitDiscount);

    const subtotal = round2(unitPrice * quantity);
    const total = subtotal; // discount already baked into unit price

    const quoteId = `QE-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const expiresAt = new Date(
      Date.now() + (PRICING.quoteExpiryHours || 72) * 60 * 60 * 1000
    ).toISOString();

    const lineItems = [
      {
        description: itemType,
        quantity,
        unitPrice,
        printMethod: printKey,
        turnaround: turnaroundKey,
        customerTier: tierKey,
        pricingTier: tier.label,
        unitDiscount,
        lineTotal: subtotal,
      },
    ];

    const quote = {
      ok: true,
      success: true,
      stage: "QUOTE_BUILT",
      data: {
        quoteId,
        lineItems,
        subtotal,
        total,
        expiresAt,
        meta: {
          pricingTier: tier.label,
          basePrice: tier.basePrice,
          printMultiplier: printMult,
          turnaroundMultiplier: turnaroundMult,
          discountRate: discount,
        },
      },
    };

    // Store in pending map for GET /quotes/pending
    _pendingQuotes.set(quoteId, { ...quote.data, builtAt: new Date().toISOString() });

    return quote;
  } catch (err) {
    return {
      ok: false,
      success: false,
      stage: "QUOTE_ERROR",
      error: err && err.message ? err.message : "quote_build_failed",
      code: "QUOTE_BUILD_FAILED",
    };
  }
}

// ---------------------------------------------------------------------------
// CHEEKY_listPendingQuotes
// ---------------------------------------------------------------------------

/**
 * Returns all in-memory pending quotes (Phase 8 — no DB yet).
 */
function CHEEKY_listPendingQuotes() {
  return {
    ok: true,
    success: true,
    data: Array.from(_pendingQuotes.values()),
    count: _pendingQuotes.size,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  CHEEKY_buildQuote,
  CHEEKY_listPendingQuotes,
  _pendingQuotes, // exposed for testing only
};
