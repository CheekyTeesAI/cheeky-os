"use strict";

/**
 * Session 2 — Voice /cheeky/voice/run success → Prisma Order + Job + Task (PENDING),
 * optional customer confirmation (Resend / Twilio) when a Square invoice exists.
 */

const path = require("path");
const { logger } = require("../utils/logger");
const { recordLastProcessedOrder } = require("./pipelineRuntimeState.service");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch {
    return null;
  }
}

function syntheticEmail(customerName, fromEmail) {
  const e = String(fromEmail || "").trim();
  if (e && e.includes("@")) return e.slice(0, 320);
  const slug =
    String(customerName || "customer")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "customer";
  return `${slug}-${Date.now().toString(36)}@voice.cheeky.local`;
}

function isLiveSquareInvoice(payload) {
  if (!payload || !payload.invoiceId) return false;
  if (payload.mode === "mock" || payload.mode === "error") return false;
  return String(payload.invoiceId).startsWith("inv:");
}

function squareInvoiceCustomerUrl(invPayload) {
  const pub = invPayload && invPayload.raw && invPayload.raw.invoice && invPayload.raw.invoice.public_url;
  if (pub) return String(pub);
  const id = invPayload && invPayload.invoiceId;
  if (id && String(id).startsWith("inv:")) {
    return `https://squareup.com/dashboard/invoices/${encodeURIComponent(id)}`;
  }
  return null;
}

async function createOrderJobTaskFromQuote(quote, meta) {
  const prisma = getPrisma();
  if (!prisma) {
    logger.warn("[voice-order] Prisma unavailable — skip Order/Task create");
    return null;
  }
  const customerName = quote.customer || "Customer";
  const email = syntheticEmail(customerName, meta.fromEmail);
  const total = Number(quote.total || 0);
  const qty = Number(quote.quantity || 0);

  const order = await prisma.order.create({
    data: {
      customerName,
      email,
      notes: `Voice quote ${quote.id || ""}`.slice(0, 500),
      status: "QUOTE_CREATED",
      totalAmount: total,
      total,
      quantity: qty || null,
      garmentType: quote.product || null,
      unitPrice: quote.unit_price != null ? Number(quote.unit_price) : null,
      quotedAmount: total,
      source: meta.source || "voice",
    },
  });

  const job = await prisma.job.create({
    data: {
      orderId: order.id,
      status: "PRODUCTION_READY",
      productionType: "DTG",
      notes: "Auto-created from /cheeky/voice/run (quote)",
    },
  });

  const task = await prisma.task.create({
    data: {
      jobId: job.id,
      orderId: order.id,
      title: `New quote — ${customerName}`,
      type: "VOICE_QUOTE",
      status: "PENDING",
      releaseStatus: "BLOCKED",
      productionHold: true,
      orderReady: false,
      blanksOrdered: false,
    },
  });

  logger.info(`[voice-order] Prisma task created taskId=${task.id} orderId=${order.id}`);
  return {
    orderId: order.id,
    taskId: task.id,
    jobId: job.id,
    customerName,
    email,
    squareInvoiceId: null,
    invoiceUrl: null,
  };
}

async function createOrderJobTaskFromInvoice(invResult, params, meta) {
  const prisma = getPrisma();
  if (!prisma) return null;
  const customerName =
    params.customer || params.customerName || params.customer_name || "Customer";
  const email = syntheticEmail(customerName, meta.fromEmail || params.email || params.customerEmail);
  const squareInvoiceId = invResult.invoiceId || (invResult.raw && invResult.raw.invoice && invResult.raw.invoice.id) || null;
  const invoiceUrl = squareInvoiceCustomerUrl(invResult);

  const order = await prisma.order.create({
    data: {
      customerName,
      email,
      phone: params.phone || params.customerPhone || null,
      notes: `Voice invoice ${squareInvoiceId || ""}`.slice(0, 500),
      status: "INVOICE_DRAFTED",
      totalAmount: Number(invResult.total || params.total || 0),
      total: Number(invResult.total || params.total || 0),
      quantity: params.quantity != null ? Number(params.quantity) : null,
      garmentType: params.product || params.title || params.item || null,
      unitPrice: params.unitPrice != null ? Number(params.unitPrice) : null,
      squareInvoiceId: squareInvoiceId || undefined,
      squareOrderId: invResult.orderId || undefined,
      paymentLink: invoiceUrl || undefined,
      source: meta.source || "voice",
    },
  });

  const job = await prisma.job.create({
    data: {
      orderId: order.id,
      status: "PRODUCTION_READY",
      productionType: "DTG",
      notes: "Auto-created from /cheeky/voice/run (invoice)",
    },
  });

  const task = await prisma.task.create({
    data: {
      jobId: job.id,
      orderId: order.id,
      title: `Order confirmed — ${customerName}`,
      type: "ORDER_CONFIRMED",
      status: "PENDING",
      releaseStatus: "BLOCKED",
      productionHold: true,
      orderReady: false,
      blanksOrdered: false,
    },
  });

  logger.info(`[voice-order] Prisma task created taskId=${task.id} orderId=${order.id}`);
  return {
    orderId: order.id,
    taskId: task.id,
    jobId: job.id,
    customerName,
    email,
    phone: params.phone || params.customerPhone || null,
    squareInvoiceId,
    invoiceUrl,
  };
}

/**
 * @param {{ action: string, params: object, result: { ok: boolean, data: any, error?: string }, meta: { fromEmail?: string, source?: string } }} args
 * @returns {Promise<object|null>}
 */
async function syncVoiceSuccessToPrisma({ action, params, result, meta }) {
  if (!result || !result.ok || !result.data) return null;
  const data = result.data;
  const metaIn = meta && typeof meta === "object" ? meta : {};

  try {
    if (action === "generate_quote" && data.customer && data.id) {
      const out = await createOrderJobTaskFromQuote(data, metaIn);
      if (out && out.orderId) {
        recordLastProcessedOrder(out.orderId, { action: "generate_quote", taskId: out.taskId });
      }
      return out;
    }
    if (action === "create_invoice" && isLiveSquareInvoice(data)) {
      const out = await createOrderJobTaskFromInvoice(data, params, metaIn);
      if (out && out.orderId) {
        recordLastProcessedOrder(out.orderId, { action: "create_invoice", taskId: out.taskId });
      }
      return out;
    }
    if (action === "close_deal" && data.invoice && isLiveSquareInvoice(data.invoice)) {
      const out = await createOrderJobTaskFromInvoice(data.invoice, params, metaIn);
      if (out && out.orderId) {
        recordLastProcessedOrder(out.orderId, { action: "close_deal", taskId: out.taskId });
      }
      return out;
    }
  } catch (err) {
    logger.error(`[voice-order] sync failed: ${err && err.message ? err.message : err}`);
  }
  return null;
}

/**
 * @param {object} orderPayload
 * @param {string} orderPayload.customerName
 * @param {string} orderPayload.email
 * @param {string} [orderPayload.phone]
 * @param {string} [orderPayload.invoiceUrl]
 * @param {string} [orderPayload.squareInvoiceId]
 * @param {string} [orderPayload.confirmationMessage]
 */
async function sendOrderConfirmation(orderPayload) {
  const {
    customerName,
    email,
    phone,
    invoiceUrl,
    squareInvoiceId,
    confirmationMessage,
  } = orderPayload || {};

  const name = customerName || "Customer";
  const linkLine = invoiceUrl
    ? `Pay your invoice: ${invoiceUrl}`
    : squareInvoiceId
      ? `Invoice reference: ${squareInvoiceId} (payment link will follow from Square if not yet published).`
      : "We will send your payment details shortly.";

  const body =
    confirmationMessage ||
    `Hi ${name},\n\nYour order is confirmed. Thank you for choosing Cheeky Tees!\n\n${linkLine}\n\n— Cheeky Tees`;

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const toEmail = String(email || "").trim();

  if (resendKey && toEmail) {
    const { sendEmail } = require("./email.send.service");
    return sendEmail({
      to: toEmail,
      subject: `Order confirmed — ${name}`,
      body,
    });
  }

  const twilioSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const twilioToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const twilioFrom = String(
    process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_NUMBER || ""
  ).trim();
  const toPhone = String(phone || "").trim();

  if (twilioSid && twilioToken && twilioFrom && toPhone) {
    const { sendFollowupSms } = require("./followupExecutorService");
    let sms = body.replace(/\n+/g, " ").trim();
    if (sms.length > 300) sms = sms.slice(0, 297) + "...";
    const r = await sendFollowupSms(toPhone, sms);
    if (r.ok) {
      console.log(`[order-confirm] Twilio SMS sent to=${toPhone}`);
      return { success: true, messageId: null, mode: "twilio" };
    }
    return { success: false, messageId: null, mode: "twilio", error: r.error };
  }

  if (resendKey) {
    logger.warn("[order-confirm] RESEND_API_KEY set but no customer email — cannot send");
    return { success: false, mode: "blocked", error: "no_recipient_email" };
  }

  logger.warn("[order-confirm] Neither RESEND_API_KEY nor Twilio configured — skipping send");
  return { success: false, mode: "unconfigured", error: "no_notification_channel" };
}

/**
 * @param {object|null} syncMeta
 * @param {object} params
 * @param {object} body
 * @param {{ ok: boolean, data: any }} result
 */
async function notifyOrderConfirmationIfEligible(syncMeta, params, body, result) {
  if (!syncMeta || !syncMeta.orderId) return;
  if (!syncMeta.squareInvoiceId && !syncMeta.invoiceUrl) return;

  const prisma = getPrisma();
  const idempotencyKey = `voice-order-confirm-${syncMeta.orderId}`;
  if (prisma && prisma.communicationLog) {
    try {
      const existing = await prisma.communicationLog.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return;
    } catch (_) {
      /* continue */
    }
  }

  let sendResult;
  try {
    sendResult = await sendOrderConfirmation({
      customerName: syncMeta.customerName,
      email: syncMeta.email,
      phone: syncMeta.phone || params.phone || (body && body.customerPhone),
      invoiceUrl: syncMeta.invoiceUrl,
      squareInvoiceId: syncMeta.squareInvoiceId,
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    logger.warn(`[order-confirm] sendOrderConfirmation threw (non-fatal): ${msg}`);
    sendResult = { success: false, mode: "error", error: msg };
  }

  if (!sendResult || sendResult.success !== true) {
    logger.warn(
      `[order-confirm] notification did not send (non-fatal): ${sendResult.error || sendResult.mode || "unknown"}`
    );
  }

  if (prisma && prisma.communicationLog) {
    try {
      await prisma.communicationLog.create({
        data: {
          orderId: syncMeta.orderId,
          channel: sendResult.mode === "twilio" ? "SMS_ORDER_CONFIRM" : "EMAIL_ORDER_CONFIRM",
          toAddress: String(syncMeta.email || syncMeta.phone || "unknown").slice(0, 320),
          subject: `Order confirmed — ${syncMeta.customerName || ""}`.slice(0, 500),
          textBody: `invoice=${syncMeta.squareInvoiceId || ""} url=${syncMeta.invoiceUrl || ""}`.slice(0, 8000),
          idempotencyKey,
          status: sendResult.success ? "SENT" : "FAILED",
          errorMessage: sendResult.error ? String(sendResult.error).slice(0, 2000) : null,
          providerMessageId: sendResult.messageId ? String(sendResult.messageId) : null,
        },
      });
    } catch (e) {
      logger.warn(`[order-confirm] communicationLog: ${e && e.message ? e.message : e}`);
    }
  }

  if (sendResult.success) {
    console.log(
      `[order-confirm] notification sent orderId=${syncMeta.orderId} mode=${sendResult.mode || "?"}`
    );
  }
}

module.exports = {
  syncVoiceSuccessToPrisma,
  sendOrderConfirmation,
  notifyOrderConfirmationIfEligible,
};
