"use strict";

function buildDepositReminder(order) {
  const name = order.customerName || "there";
  return {
    type: "DEPOSIT_REMINDER",
    subject: `Deposit reminder for Order ${order.id}`,
    text:
      `Hey ${name}, just checking in on your apparel order. ` +
      `We're ready to move forward as soon as your deposit is received. ` +
      `Reply here or call Cheeky Tees if you need anything.`,
    html:
      `<p>Hey ${name},</p>` +
      `<p>Just checking in on your apparel order.</p>` +
      `<p>We're ready to move forward as soon as your deposit is received.</p>` +
      `<p>Reply here or call <strong>Cheeky Tees</strong> if you need anything.</p>`,
  };
}

function buildPickupNotification(order) {
  const name = order.customerName || "there";
  return {
    type: "PICKUP_NOTIFICATION",
    subject: `Your order ${order.id} is ready for pickup`,
    text:
      `Hey ${name}, your order is ready for pickup at Cheeky Tees. ` +
      `Reply here if you need pickup details or timing.`,
    html:
      `<p>Hey ${name},</p>` +
      `<p>Your order is ready for pickup at <strong>Cheeky Tees</strong>.</p>` +
      `<p>Reply here if you need pickup details or timing.</p>`,
  };
}

function buildStatusUpdate(order) {
  const name = order.customerName || "there";
  const status = order.status || "IN_PROGRESS";
  const nextAction = order.nextAction || "We are working on it";
  return {
    type: "STATUS_UPDATE",
    subject: `Update on Order ${order.id}`,
    text:
      `Hey ${name}, here's an update on your order. ` +
      `Current status: ${status}. Next step: ${nextAction}.`,
    html:
      `<p>Hey ${name},</p>` +
      `<p>Here's an update on your order.</p>` +
      `<p><strong>Current status:</strong> ${status}</p>` +
      `<p><strong>Next step:</strong> ${nextAction}</p>`,
  };
}

/**
 * Standardized customer / vendor message templates — no fabricated financial amounts.
 */

const SHOP = "Cheeky Tees";

function baseAssumptions(ctx) {
  const a = [];
  if (ctx && ctx.mockSquare) a.push("Square data may be mock or degraded — verify before relying on amounts.");
  if (ctx && ctx.mockJob) a.push("Job data may be incomplete — verify before sending.");
  return a;
}

function renderMissingInfo(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  const missing = Array.isArray(ctx && ctx.missingFields) ? ctx.missingFields.join(", ") : "a few details";
  return {
    subject: `${SHOP} — we need a bit more info`,
    body:
      `Hi ${name},\n\n` +
      `Thanks for reaching out. To move your request forward, we still need: ${missing}.\n\n` +
      `Reply to this email with the details, or call the shop and we’ll capture it quickly.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "MISSING_INFO",
    assumptions: [...baseAssumptions(ctx), "Missing fields list comes from intake record when present."],
  };
}

function renderQuoteReady(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  const ref = ctx && ctx.quoteRef ? String(ctx.quoteRef) : "your quote";
  return {
    subject: `${SHOP} — your quote is ready`,
    body:
      `Hi ${name},\n\n` +
      `Your estimate is ready for review (${ref}). Reply if you’d like changes, or let us know when you’re ready to proceed.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "QUOTE_READY",
    assumptions: [...baseAssumptions(ctx), "Quote reference must be confirmed in Square or internal records."],
  };
}

function renderInvoiceReminder(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  const amt =
    ctx && ctx.amountDue != null && Number.isFinite(Number(ctx.amountDue))
      ? `$${Number(ctx.amountDue).toFixed(2)}`
      : "the balance shown on your invoice";
  return {
    subject: `${SHOP} — invoice reminder`,
    body:
      `Hi ${name},\n\n` +
      `This is a friendly reminder about an open invoice. Amount due (per our records): ${amt}.\n` +
      `If you’ve already paid, reply with a receipt and we’ll reconcile.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "INVOICE_REMINDER",
    assumptions: [
      ...baseAssumptions(ctx),
      "Amount is only included when provided from Square or confirmed job fields — never guessed.",
    ],
  };
}

function renderDepositRequired(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  const jobRef = ctx && ctx.jobId ? String(ctx.jobId) : "your order";
  return {
    subject: `${SHOP} — deposit needed to schedule`,
    body:
      `Hi ${name},\n\n` +
      `We’re ready to lock in ${jobRef}, but we still need the deposit before we can schedule production.\n` +
      `Reply if you need the payment link resent, or call the shop.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "DEPOSIT_REQUIRED",
    assumptions: [...baseAssumptions(ctx), "Deposit requirement must match job / Square state."],
  };
}

function renderPaymentConfirmation(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  return {
    subject: `${SHOP} — payment received, thank you`,
    body:
      `Hi ${name},\n\n` +
      `We’ve recorded your payment — thank you. We’ll move your job forward and keep you posted.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "PAYMENT_CONFIRMATION",
    assumptions: [...baseAssumptions(ctx), "Only send after payment is confirmed in Square or operator verification."],
  };
}

function renderArtNeeded(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  return {
    subject: `${SHOP} — artwork needed`,
    body:
      `Hi ${name},\n\n` +
      `We’re waiting on print-ready artwork to keep your job on track. Please send vector or high-resolution files, or let us know if you need help with art services.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "ART_NEEDED",
    assumptions: [...baseAssumptions(ctx)],
  };
}

function renderArtApprovalRequest(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  return {
    subject: `${SHOP} — please approve your proof`,
    body:
      `Hi ${name},\n\n` +
      `Your proof is ready for review. Please reply with approval or requested changes so we can proceed.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "ART_APPROVAL_REQUEST",
    assumptions: [...baseAssumptions(ctx)],
  };
}

function renderJobStatusUpdate(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  const st = ctx && ctx.statusLabel ? String(ctx.statusLabel) : "updated";
  return {
    subject: `${SHOP} — order update`,
    body:
      `Hi ${name},\n\n` +
      `Quick update: your order is now ${st}. Reply if you have any questions.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "JOB_STATUS_UPDATE",
    assumptions: [...baseAssumptions(ctx), "Status label must reflect system state."],
  };
}

function renderReadyForPickup(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  return {
    subject: `${SHOP} — your order is ready for pickup`,
    body:
      `Hi ${name},\n\n` +
      `Your order is ready for pickup. Stop by during shop hours, or reply if you need shipping instead.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "READY_FOR_PICKUP",
    assumptions: [...baseAssumptions(ctx), "Only valid when job/production state confirms pickup-ready."],
  };
}

function renderFollowupGeneral(ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName) : "there";
  const note = ctx && ctx.note ? String(ctx.note) : "following up on your order";
  return {
    subject: `${SHOP} — quick follow-up`,
    body:
      `Hi ${name},\n\n` +
      `${note}\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "FOLLOWUP_GENERAL",
    assumptions: [...baseAssumptions(ctx)],
  };
}

function renderPoReady(ctx) {
  const vendor = ctx && ctx.vendorName ? String(ctx.vendorName) : "supplier";
  const po = ctx && ctx.poNumber ? String(ctx.poNumber) : "PO";
  return {
    subject: `${SHOP} — PO ${po} ready`,
    body:
      `Hello ${vendor},\n\n` +
      `Purchase order ${po} is approved and ready. Please confirm receipt and ETA.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "PO_READY",
    assumptions: [...baseAssumptions(ctx), "Vendor outbound may be handled by a separate workflow."],
  };
}

function renderWorkOrderNotice(ctx) {
  const vendor = ctx && ctx.vendorName ? String(ctx.vendorName) : "team";
  return {
    subject: `${SHOP} — work order / production notice`,
    body:
      `Hello ${vendor},\n\n` +
      `Please see the attached work order details for ${vendor}. Reply with any questions.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "WORK_ORDER_NOTICE",
    assumptions: [...baseAssumptions(ctx)],
  };
}

function renderDirectShipConfirmation(ctx) {
  const vendor = ctx && ctx.vendorName ? String(ctx.vendorName) : "supplier";
  return {
    subject: `${SHOP} — direct ship confirmation`,
    body:
      `Hello ${vendor},\n\n` +
      `Please confirm direct ship to the address on file for this order. Reply with tracking when shipped.\n\n` +
      `— ${SHOP}`,
    channel: "EMAIL",
    templateKey: "DIRECT_SHIP_CONFIRMATION",
    assumptions: [...baseAssumptions(ctx)],
  };
}

/** SMS variants — short */
function smsBody(templateKey, ctx) {
  const name = ctx && ctx.customerName ? String(ctx.customerName).split(/\s+/)[0] : "Hi";
  const map = {
    MISSING_INFO: `${name}, Cheeky Tees needs a bit more info on your order — reply or call us.`,
    QUOTE_READY: `${name}, your Cheeky Tees quote is ready. Check email or reply for changes.`,
    INVOICE_REMINDER: `${name}, friendly reminder: open invoice at Cheeky Tees. Reply if already paid.`,
    DEPOSIT_REQUIRED: `${name}, we need your deposit to schedule production at Cheeky Tees. Reply for help.`,
    PAYMENT_CONFIRMATION: `${name}, we received your payment — thank you. — Cheeky Tees`,
    ART_NEEDED: `${name}, we need artwork to continue your Cheeky Tees order. Reply with files.`,
    ART_APPROVAL_REQUEST: `${name}, please approve your Cheeky Tees proof — reply with OK or edits.`,
    JOB_STATUS_UPDATE: `${name}, update on your Cheeky Tees order — check email for details.`,
    READY_FOR_PICKUP: `${name}, your Cheeky Tees order is ready for pickup. Reply if you need shipping.`,
    FOLLOWUP_GENERAL: `${name}, quick follow-up from Cheeky Tees — check email or call.`,
  };
  const body = map[String(templateKey).toUpperCase()] || `${name}, message from Cheeky Tees — see email.`;
  return body.length > 300 ? body.slice(0, 297) + "..." : body;
}

/**
 * @param {string} templateKey
 * @param {string} channel EMAIL | SMS
 * @param {object} ctx
 */
function buildTemplate(templateKey, channel, ctx) {
  const tk = String(templateKey || "FOLLOWUP_GENERAL").toUpperCase();
  const ch = String(channel || "EMAIL").toUpperCase();
  const builders = {
    MISSING_INFO: renderMissingInfo,
    QUOTE_READY: renderQuoteReady,
    INVOICE_REMINDER: renderInvoiceReminder,
    DEPOSIT_REQUIRED: renderDepositRequired,
    PAYMENT_CONFIRMATION: renderPaymentConfirmation,
    ART_NEEDED: renderArtNeeded,
    ART_APPROVAL_REQUEST: renderArtApprovalRequest,
    JOB_STATUS_UPDATE: renderJobStatusUpdate,
    READY_FOR_PICKUP: renderReadyForPickup,
    FOLLOWUP_GENERAL: renderFollowupGeneral,
    PO_READY: renderPoReady,
    WORK_ORDER_NOTICE: renderWorkOrderNotice,
    DIRECT_SHIP_CONFIRMATION: renderDirectShipConfirmation,
  };
  const fn = builders[tk] || renderFollowupGeneral;
  const emailOut = fn(ctx || {});
  if (ch === "SMS") {
    return {
      subject: null,
      body: smsBody(tk, ctx || {}),
      channel: "SMS",
      templateKey: tk,
      assumptions: (emailOut.assumptions || []).concat("SMS uses shortened copy."),
    };
  }
  return emailOut;
}

module.exports = {
  buildDepositReminder,
  buildPickupNotification,
  buildStatusUpdate,
  buildTemplate,
  smsBody,
};
