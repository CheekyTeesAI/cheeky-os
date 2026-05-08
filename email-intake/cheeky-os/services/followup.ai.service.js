"use strict";

/**
 * PHASE 2 — Follow-Up AI Message Generation
 * Generates professional, friendly follow-up messages based on invoice context.
 * Template-driven (no external AI API required). Context-aware tone scaling.
 *
 * NO AUTO-SEND. Returns draft only.
 */

const SHOP_NAME  = "Cheeky Tees";
const SHOP_PHONE = "864-498-3475";
const SHOP_EMAIL = "hello@cheekytees.com";

/**
 * Determine message tone from days outstanding.
 */
function getTone(daysOutstanding) {
  if (daysOutstanding <= 3)  return "gentle";
  if (daysOutstanding <= 10) return "friendly";
  if (daysOutstanding <= 21) return "warm_urgent";
  return "firm";
}

/**
 * Format dollar amount cleanly.
 */
function fmt(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

/**
 * Get first name from full name string.
 */
function firstName(fullName) {
  const name = String(fullName || "").trim();
  if (!name || name === "Unknown Customer") return "there";
  return name.split(" ")[0];
}

// ─── Message templates by tone ─────────────────────────────────────────────────

const TEMPLATES = {
  gentle: (inv) => ({
    subject: `Quick note on your ${SHOP_NAME} order`,
    body: `Hi ${firstName(inv.customerName)},

Hope you're doing well! Just a quick heads-up — we have an invoice of ${fmt(inv.amount)} that's ready for your review.

If you've already taken care of it, no worries at all — just let us know and we'll mark it complete on our end.

If you have any questions or want to chat through the details, feel free to reply here or give us a call at ${SHOP_PHONE}.

Thanks so much,
${SHOP_NAME}
${SHOP_PHONE}`,
  }),

  friendly: (inv) => ({
    subject: `Friendly follow-up — ${SHOP_NAME} invoice for ${fmt(inv.amount)}`,
    body: `Hi ${firstName(inv.customerName)},

Just checking in! We have an outstanding invoice of ${fmt(inv.amount)} on your account that's been open for ${inv.daysOutstanding} day${inv.daysOutstanding !== 1 ? "s" : ""}.

We'd love to get this wrapped up so we can keep moving on your order. When you get a chance, you can:
  • Reply to this email and we'll send a payment link
  • Call us at ${SHOP_PHONE}
  • Stop by the shop at 104 Trade Street, Fountain Inn, SC

Let us know if there's anything we can help with!

Best,
${SHOP_NAME}`,
  }),

  warm_urgent: (inv) => ({
    subject: `Action needed — ${SHOP_NAME} invoice ${inv.invoiceId ? `#${String(inv.invoiceId).slice(-6)}` : ""}`,
    body: `Hi ${firstName(inv.customerName)},

We wanted to reach out regarding your outstanding balance of ${fmt(inv.amount)}, which has been open for ${inv.daysOutstanding} days.

We want to make sure everything's good on your end. Please reach out at your earliest convenience so we can get this sorted — we'd hate for it to hold up your order.

You can:
  • Call us directly: ${SHOP_PHONE}
  • Reply to this email
  • Pay online via the Square invoice link we sent earlier

We appreciate your business and want to keep things moving smoothly!

Thanks,
${SHOP_NAME}
${SHOP_EMAIL}`,
  }),

  firm: (inv) => ({
    subject: `Important: Outstanding balance of ${fmt(inv.amount)} — ${SHOP_NAME}`,
    body: `Hi ${firstName(inv.customerName)},

We're following up on an outstanding invoice of ${fmt(inv.amount)} that has been open for ${inv.daysOutstanding} days.

We'd like to resolve this as soon as possible. Please contact us at ${SHOP_PHONE} or reply to this email to arrange payment.

We value your business and want to continue working together. Resolving this will allow us to move your order forward without any further delays.

Thank you,
${SHOP_NAME}
${SHOP_PHONE}`,
  }),
};

/**
 * Generate a follow-up draft message for an unpaid invoice.
 *
 * @param {object} invoice - { customerName, email, amount, daysOutstanding, invoiceId, ... }
 * @returns {{ subject: string, body: string, tone: string }}
 */
function generateFollowUp(invoice) {
  try {
    const tone = getTone(Number(invoice.daysOutstanding) || 0);
    const template = TEMPLATES[tone] || TEMPLATES.friendly;
    const message = template(invoice);
    return {
      subject: message.subject,
      body: message.body,
      tone,
      to: invoice.email || "",
      customerName: invoice.customerName || "",
    };
  } catch (err) {
    console.warn("[followup.ai] message generation failed:", err && err.message ? err.message : err);
    return {
      subject: `Follow-up on your ${SHOP_NAME} invoice`,
      body: `Hi — just following up on your outstanding invoice of ${fmt(invoice && invoice.amount)}. Please contact us at ${SHOP_PHONE}.`,
      tone: "fallback",
      to: (invoice && invoice.email) || "",
      customerName: (invoice && invoice.customerName) || "",
    };
  }
}

module.exports = { generateFollowUp };
