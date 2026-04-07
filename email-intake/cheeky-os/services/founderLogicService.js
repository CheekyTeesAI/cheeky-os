/**
 * Bundle 9 — founder-style priority, risk, and next-step rules (pure, no I/O).
 */

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const URGENT_TERMS = ["today", "tomorrow", "asap", "urgent"];

const RISK_TEXT_TERMS = [
  "revise",
  "revisions",
  "changes",
  "not paid",
  "waiting",
];

/**
 * @param {{
 *   customerName?: string,
 *   quantity?: number,
 *   product?: string,
 *   productType?: string,
 *   printType?: string,
 *   dueText?: string,
 *   flags?: string[],
 *   confidence?: string,
 *   status?: string,
 *   paymentStatus?: string,
 *   rawText?: string,
 * }} input
 */
function evaluateFounderLogic(input) {
  const empty = () => ({
    priority: "low",
    riskLevel: "low",
    riskFlags: [],
    nextStep: "Move to production review",
    notes: [],
  });

  try {
    const inFlags = new Set(
      Array.isArray(input && input.flags) ? input.flags : []
    );
    const quantity = Math.max(0, Math.floor(Number(input && input.quantity) || 0));
    const productType = String(
      input && input.productType != null ? input.productType : ""
    ).trim();
    const printType = String(
      input && input.printType != null ? input.printType : ""
    ).trim();
    const dueText = String(
      input && input.dueText != null ? input.dueText : ""
    ).trim();
    const rawText = String(
      input && input.rawText != null ? input.rawText : ""
    ).trim();
    const confidence = String(
      input && input.confidence != null ? input.confidence : ""
    )
      .trim()
      .toLowerCase();
    const status = String(input && input.status != null ? input.status : "").trim();
    const paymentStatus = String(
      input && input.paymentStatus != null ? input.paymentStatus : ""
    )
      .trim()
      .toLowerCase();

    const combinedDue = `${dueText} ${rawText}`.toLowerCase();

    /** @type {"low"|"medium"|"high"|"critical"} */
    let priority = "low";
    if (URGENT_TERMS.some((t) => combinedDue.includes(t))) {
      priority = "critical";
    } else if (quantity >= 48) {
      priority = "high";
    } else if (WEEKDAYS.some((d) => combinedDue.includes(d))) {
      priority = "high";
    } else if (confidence === "medium") {
      priority = "medium";
    } else {
      priority = "low";
    }

    /** @type {"low"|"medium"|"high"} */
    let riskLevel = "low";
    const riskFlags = [];
    const notes = [];

    if (inFlags.has("unknown_product")) {
      riskLevel = "high";
      riskFlags.push("unknown_product");
      notes.push("Unknown product type needs review");
    }
    if (inFlags.has("unknown_print")) {
      riskLevel = "high";
      riskFlags.push("unknown_print");
      notes.push("Unknown print type needs review");
    }
    if (quantity === 0) {
      riskLevel = "high";
      if (!riskFlags.includes("zero_quantity")) riskFlags.push("zero_quantity");
      notes.push("Quantity not confirmed");
    }

    if (confidence === "low" && riskLevel !== "high") {
      riskLevel = "medium";
      notes.push("Low confidence parse — double-check details");
    }

    const rawLower = rawText.toLowerCase();
    const hasRiskWords = RISK_TEXT_TERMS.some((w) => {
      if (w === "not paid") return /\bnot\s*-?\s*paid\b|\bunpaid\b/i.test(rawText);
      return rawLower.includes(w);
    });
    if (hasRiskWords && riskLevel === "low") {
      riskLevel = "medium";
      notes.push("Brief mentions revisions, payment, or waiting");
    } else if (hasRiskWords && riskLevel === "medium") {
      notes.push("Brief mentions revisions, payment, or waiting");
    }

    if (priority === "critical" || URGENT_TERMS.some((t) => combinedDue.includes(t))) {
      notes.push("Due text suggests urgency");
    }

    if (paymentStatus === "not_paid") {
      notes.push("Payment not confirmed");
    }

    let nextStep = "Move to production review";
    if (quantity === 0) {
      nextStep = "Clarify quantity";
    } else if (productType === "unknown") {
      nextStep = "Clarify product type";
    } else if (printType === "unknown") {
      nextStep = "Clarify print location/type";
    } else if (paymentStatus === "not_paid") {
      nextStep = "Collect deposit or payment";
    } else if (!status) {
      nextStep = "Create or update order";
    } else {
      nextStep = "Move to production review";
    }

    return {
      priority,
      riskLevel,
      riskFlags,
      nextStep,
      notes: [...new Set(notes)].filter(Boolean),
    };
  } catch {
    return empty();
  }
}

module.exports = { evaluateFounderLogic };
