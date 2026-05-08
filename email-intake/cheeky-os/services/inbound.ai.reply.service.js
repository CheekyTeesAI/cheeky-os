"use strict";

/**
 * PHASE 4 — AI reply draft engine (suggestions only; never auto-send).
 */

const SHOP = "Cheeky Tees";
const PHONE = "864-498-3475";

/**
 * @param {object} message
 * @param {object} [context] — { intent, opportunityType, matchedCustomerName }
 * @returns {Promise<{intent: string, subject: string, body: string}>}
 */
async function generateReplyDraft(message, context) {
  const body = message.body || "";
  const lower = body.toLowerCase();

  let intent = "general";

  if (lower.includes("pay") || lower.includes("invoice") || lower.includes("deposit")) {
    intent = "payment";
  } else if (lower.includes("quote") || lower.includes("order") || lower.includes("price")) {
    intent = "sales";
  }

  if ((context && context.opportunityType) === "production_status") {
    intent = "production";
  }

  const nameHint = context && context.matchedCustomerName ? `Thanks, ${context.matchedCustomerName.split(" ")[0]}` : "Hey";

  const rawSub = String(message.subject || SHOP).replace(/^(re:\s*)+/gi, "").trim() || SHOP;

  let replyBody = `${nameHint} — thanks for getting back to us. I'll take a look and follow up shortly.`;

  if (intent === "payment") {
    replyBody = `${nameHint} — thanks for reaching out about the invoice. I'll confirm the balance and send you the payment link or next steps here shortly. If you prefer, you can call us at ${PHONE}.`;
  } else if (intent === "sales") {
    replyBody = `${nameHint} — appreciate your note on pricing / your order. I'll review the details and circle back with options.`;
  } else if (intent === "production") {
    replyBody = `${nameHint} — thanks for checking in on timing. I'll confirm production status and reply with an update.`;
  }

  return {
    intent,
    subject: `Re: ${rawSub}`,
    body: replyBody,
    note: "DRAFT ONLY — requires operator approval before any send.",
  };
}

module.exports = { generateReplyDraft };
