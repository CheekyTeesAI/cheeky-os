/**
 * Bundle 32 — pure rules for guarded auto draft-invoice (no DB / no AI).
 */

/**
 * @param {{
 *   customerName?: string,
 *   customerId?: string,
 *   orderId?: string,
 *   intent?: string,
 *   confidence?: string,
 *   amount?: number,
 *   invoiceExists?: boolean,
 *   cooldownPassed?: boolean,
 * }} input
 * @returns {{
 *   shouldCreateDraft: boolean,
 *   reason: string,
 *   safetyLevel: "blocked" | "review" | "clear",
 * }}
 */
function evaluateAutoInvoiceGuard(input) {
  const intent = String(input && input.intent != null ? input.intent : "").trim();
  const confidence = String(
    input && input.confidence != null ? input.confidence : ""
  )
    .trim()
    .toLowerCase();
  const customerId = String(
    input && input.customerId != null ? input.customerId : ""
  ).trim();
  const amount = Number(input && input.amount);
  const invoiceExists = !!(input && input.invoiceExists);
  const cooldownPassed = !(input && input.cooldownPassed === false);

  if (invoiceExists) {
    return {
      shouldCreateDraft: false,
      reason: "A recent draft invoice already exists for this customer",
      safetyLevel: "blocked",
    };
  }

  if (intent !== "ready_to_pay") {
    return {
      shouldCreateDraft: false,
      reason: "Only ready_to_pay replies qualify for auto draft",
      safetyLevel: "blocked",
    };
  }

  if (!customerId) {
    return {
      shouldCreateDraft: false,
      reason: "Square customerId is required for draft creation",
      safetyLevel: "blocked",
    };
  }

  if (!Number.isFinite(amount) || amount < 200) {
    return {
      shouldCreateDraft: false,
      reason: "Amount must be at least 200 for auto draft",
      safetyLevel: "review",
    };
  }

  if (confidence !== "high") {
    return {
      shouldCreateDraft: false,
      reason: "Interpretation confidence must be high for auto draft",
      safetyLevel: "review",
    };
  }

  if (!cooldownPassed) {
    return {
      shouldCreateDraft: false,
      reason: "Cooldown active — wait before retrying auto-invoice",
      safetyLevel: "review",
    };
  }

  return {
    shouldCreateDraft: true,
    reason: "All safety checks passed — draft-only creation permitted",
    safetyLevel: "clear",
  };
}

module.exports = {
  evaluateAutoInvoiceGuard,
};
