/**
 * Bundle 13 — job intelligence (pure rules, no I/O).
 */

const RISK_TEXT = ["revision", "changes", "not final"];

/**
 * @param {unknown} memory
 */
function memoryFlagPaymentIssue(memory) {
  if (!memory || typeof memory !== "object") return false;
  const flags = /** @type {Record<string, unknown>} */ (memory).flags;
  if (!Array.isArray(flags)) return false;
  return flags.some((f) => {
    const label = String(
      f && typeof f === "object" && "label" in f
        ? /** @type {{label?:string}} */ (f).label
        : ""
    ).toLowerCase();
    if (!label) return false;
    return (
      label.includes("payment") ||
      label.includes("deposit") ||
      label.includes("unpaid") ||
      label.includes("not paid")
    );
  });
}

/**
 * @param {unknown} memory
 */
function memoryHintsRepeatCustomer(memory) {
  if (!memory || typeof memory !== "object") return false;
  const m = /** @type {Record<string, unknown>} */ (memory);
  const blobs = [m.notes, m.decisions, m.history];
  const words = /\b(repeat|last time|again|regular|usual)\b/i;
  for (const b of blobs) {
    if (!Array.isArray(b)) continue;
    for (const item of b) {
      const t =
        item && typeof item === "object" && "text" in item
          ? String(/** @type {{text?:string}} */ (item).text || "")
          : item && typeof item === "object" && "event" in item
            ? String(/** @type {{event?:string}} */ (item).event || "")
            : "";
      if (words.test(t)) return true;
    }
  }
  return false;
}

function inferProductType(productType, product) {
  const pt = String(productType || "").trim().toLowerCase();
  if (pt === "shirt" || pt === "hoodie") return pt;
  const p = String(product || "").toLowerCase();
  if (p.includes("hoodie")) return "hoodie";
  if (p.includes("shirt")) return "shirt";
  return pt || "";
}

/**
 * @param {{
 *   customerName?: string,
 *   quantity?: number,
 *   productType?: string,
 *   product?: string,
 *   printType?: string,
 *   dueText?: string,
 *   status?: string,
 *   paymentStatus?: string,
 *   memory?: unknown,
 *   rawText?: string,
 * }} input
 */
function analyzeJob(input) {
  const inEmpty = input || {};
  const qty = Math.max(0, Math.floor(Number(inEmpty.quantity) || 0));
  const paymentStatus = String(
    inEmpty.paymentStatus != null ? inEmpty.paymentStatus : ""
  )
    .trim()
    .toLowerCase();
  const printType = String(
    inEmpty.printType != null ? inEmpty.printType : ""
  ).trim();
  const rawText = String(inEmpty.rawText != null ? inEmpty.rawText : "").toLowerCase();
  const memory = inEmpty.memory;
  const productType = inferProductType(
    inEmpty.productType,
    inEmpty.product
  );
  const noPrint = !printType || printType === "unknown";

  /** @type {"low"|"medium"|"high"} */
  let riskLevel = "low";
  const riskFlags = [];

  if (paymentStatus === "not_paid") {
    riskLevel = "high";
    riskFlags.push("payment_not_confirmed");
  }
  if (memoryFlagPaymentIssue(memory)) {
    riskLevel = "high";
    riskFlags.push("memory_payment_signal");
  }
  for (const w of RISK_TEXT) {
    if (rawText.includes(w)) {
      riskLevel = "high";
      riskFlags.push("revision_risk");
      break;
    }
  }
  if (qty < 12) {
    if (riskLevel !== "high") riskLevel = "medium";
    riskFlags.push("low_quantity");
  }

  const uniqueRiskFlags = [...new Set(riskFlags)];

  let upsellSuggestion = "";
  let upsellReason = "";
  /** @type {"low"|"medium"|"high"} */
  let upsellConfidence = "low";

  if (qty >= 12 && qty <= 30) {
    upsellSuggestion = "Offer pricing at 48 units for better margin";
    upsellReason = "Order size in 12–30 range benefits from volume tier";
    upsellConfidence = "medium";
  }

  if (productType === "shirt" && noPrint) {
    if (!upsellSuggestion) {
      upsellSuggestion = "Offer front + back bundle";
      upsellReason = "Apparel order without print location specified";
      upsellConfidence = "medium";
    }
  }

  if (memoryHintsRepeatCustomer(memory)) {
    const line = "Offer bundle or repeat order discount";
    if (!upsellSuggestion) {
      upsellSuggestion = line;
      upsellReason = "Memory suggests repeat relationship";
      upsellConfidence = "low";
    } else {
      upsellReason = upsellReason
        ? upsellReason + "; repeat customer hint"
        : "Repeat customer hint";
      if (upsellConfidence === "medium") upsellConfidence = "high";
    }
  }

  let pricingFlag = "";
  let pricingReason = "";
  if (qty > 0 && qty < 12) {
    pricingFlag = "Low quantity — margin risk";
    pricingReason = "Below typical minimum run for margin";
  } else if (qty >= 100) {
    pricingFlag = "Bulk order — competitive pricing zone";
    pricingReason = "Large volume may justify tiered quote";
  }

  let recommendation = "Proceed to production planning";
  if (paymentStatus !== "paid") {
    recommendation = "Collect deposit before production";
  } else if (riskLevel === "high") {
    recommendation = "Clarify details before proceeding";
  } else if (upsellSuggestion) {
    recommendation = upsellSuggestion;
  } else {
    recommendation = "Proceed to production planning";
  }

  return {
    risk: {
      level: riskLevel,
      flags: uniqueRiskFlags,
    },
    upsell: {
      suggestion: upsellSuggestion,
      reason: upsellReason,
      confidence: upsellConfidence,
    },
    pricing: {
      flag: pricingFlag,
      reason: pricingReason,
    },
    recommendation,
  };
}

module.exports = { analyzeJob, inferProductType };
