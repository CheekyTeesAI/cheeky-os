"use strict";

/**
 * Draft-only customer messages (CommunicationApproval). Never sends from here.
 * Idempotent by orderId + messageType + non-terminal status (not SENT/CANCELED).
 */

const path = require("path");

const MESSAGE_TYPES = new Set([
  "ART_APPROVAL_REQUEST",
  "DEPOSIT_RECEIVED",
  "PRODUCTION_STARTED",
  "READY_FOR_PICKUP",
  "BALANCE_DUE",
  "SHIPPING_ADDRESS_NEEDED",
  "SHIPPING_STAGED",
  "LOCAL_DELIVERY_STAGED",
  "GENERAL_UPDATE",
  "PRODUCTION_READY",
]);

const TERMINAL = new Set(["SENT", "CANCELED"]);

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {object} order - Prisma Order-like
 * @param {string} type
 * @returns {{ subject: string, textBody: string, htmlBody: string }}
 */
function generateCustomerMessage(order, type) {
  const t = String(type || "").trim();
  if (!MESSAGE_TYPES.has(t)) {
    throw new Error(`Invalid message type: ${type}`);
  }
  const name = String(order.customerName || "there").trim() || "there";
  const first = name.split(/\s+/)[0] || name;
  const shop = process.env.CHEEKY_BIZ_NAME || "Cheeky Tees";
  const ordRef =
    String(order.orderNumber || "").trim() ||
    (order.id ? String(order.id).slice(0, 8) : "your order");

  if (t === "DEPOSIT_RECEIVED") {
    return {
      subject: `${shop} — we received your deposit`,
      textBody: `Hi ${first},\n\nThanks — we've received your deposit for order ${ordRef}. Your order is moving forward; we'll keep you posted on next steps.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>Thanks — we've received your deposit for order ${escapeHtml(ordRef)}.</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  if (t === "PRODUCTION_READY") {
    return {
      subject: `${shop} — your order is scheduled for production`,
      textBody: `Hi ${first},\n\nYour order (${ordRef}) is approved for production. We'll update you as milestones complete.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>Your order is approved for production.</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  if (t === "PRODUCTION_STARTED") {
    return {
      subject: `${shop} — production has started (${ordRef})`,
      textBody: `Hi ${first},\n\nProduction has started on your order ${ordRef}. We're on it and will reach out if we need anything.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>Production has started on your order.</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  if (t === "ART_APPROVAL_REQUEST") {
    return {
      subject: `${shop} — please approve your artwork (${ordRef})`,
      textBody: `Hi ${first},\n\nWe're ready for your review on the artwork for order ${ordRef}. Please reply with approval or any changes you'd like.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>We're ready for your review on the artwork for order ${escapeHtml(ordRef)}.</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  if (t === "READY_FOR_PICKUP") {
    return {
      subject: `${shop} — your order is ready for pickup`,
      textBody: `Hi ${first},\n\nYour order ${ordRef} is ready for pickup. Reply or call us to arrange a time that works for you.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>Your order is ready for pickup.</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  if (t === "BALANCE_DUE") {
    const total = Number(order.totalAmount ?? order.quotedAmount ?? order.total ?? 0) || 0;
    const paid = Number(order.amountPaid ?? 0) || 0;
    const due = Math.max(0, total - paid);
    const dueStr = due > 0 ? `$${due.toFixed(2)}` : "the remaining balance";
    return {
      subject: `${shop} — balance due (${ordRef})`,
      textBody: `Hi ${first},\n\nYour order ${ordRef} has a remaining balance of ${dueStr}. We'll send a payment link on request, or reply with any questions.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>There is a remaining balance on your order (${escapeHtml(dueStr)}).</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  if (t === "SHIPPING_ADDRESS_NEEDED") {
    return {
      subject: `${shop} — shipping address needed (${ordRef})`,
      textBody: `Hi ${first},\n\nYour order ${ordRef} is ready to ship — please reply with your complete shipping address (name, street, city, state, ZIP) and confirm the package weight if you have it, so we can send your package.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>We need your shipping details to send order ${escapeHtml(ordRef)}.</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  if (t === "SHIPPING_STAGED") {
    return {
      subject: `${shop} — your order is being prepared to ship (${ordRef})`,
      textBody: `Hi ${first},\n\nYour order ${ordRef} is packed and we're preparing shipment. You'll receive tracking when it ships.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>Your order is staged for shipment.</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  if (t === "LOCAL_DELIVERY_STAGED") {
    return {
      subject: `${shop} — local delivery scheduled (${ordRef})`,
      textBody: `Hi ${first},\n\nYour order ${ordRef} is ready for local delivery. We'll coordinate timing shortly — reply if you have preferences.\n\n— ${shop}`,
      htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>Your order is ready for local delivery.</p><p>— ${escapeHtml(shop)}</p>`,
    };
  }
  return {
    subject: `${shop} — update on your order (${ordRef})`,
    textBody: `Hi ${first},\n\nHere's a quick update on your order ${ordRef}. If you have questions, just reply to this message.\n\n— ${shop}`,
    htmlBody: `<p>Hi ${escapeHtml(first)},</p><p>Here's an update on your order.</p><p>— ${escapeHtml(shop)}</p>`,
  };
}

function stableIdempotencyKey(orderId, type) {
  return `comms-draft-${String(orderId).trim()}-${String(type).trim()}`;
}

/**
 * @param {string} orderId
 * @param {string} type
 * @param {string} [channel]
 * @returns {Promise<{ ok: boolean, id?: string, existing?: boolean, error?: string }>}
 */
async function createCustomerMessageDraft(orderId, type, channel) {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "no_prisma" };
  const t = String(type || "").trim();
  if (!MESSAGE_TYPES.has(t)) return { ok: false, error: "invalid_type" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
  });
  if (!order) return { ok: false, error: "not_found" };

  const existing = await prisma.communicationApproval.findFirst({
    where: {
      orderId,
      messageType: t,
      status: { notIn: [...TERMINAL] },
    },
  });
  if (existing) {
    console.log(`[comms] DRAFT EXISTS orderId=${orderId} type=${t} id=${existing.id}`);
    return { ok: true, id: existing.id, existing: true };
  }

  const gen = generateCustomerMessage(order, t);
  const emailRaw = String(order.email || "").trim();
  const toAddress = emailRaw || "pending-recipient@local.invalid";
  const idempotencyKey = stableIdempotencyKey(orderId, t);

  try {
    const row = await prisma.communicationApproval.create({
      data: {
        orderId,
        channel: channel || "email",
        toAddress,
        subject: gen.subject,
        textBody: gen.textBody,
        htmlBody: gen.htmlBody,
        idempotencyKey,
        status: "DRAFT",
        messageType: t,
      },
    });
    console.log(`[comms] DRAFT CREATED orderId=${orderId} type=${t}`);
    return { ok: true, id: row.id };
  } catch (e) {
    if (e && e.code === "P2002") {
      const again = await prisma.communicationApproval.findFirst({
        where: { idempotencyKey },
      });
      if (again) {
        console.log(`[comms] DRAFT EXISTS orderId=${orderId} type=${t} id=${again.id}`);
        return { ok: true, id: again.id, existing: true };
      }
    }
    const msg = e && e.message ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * @returns {Promise<{ id: string }|null>}
 */
async function persistDraftMessage(orderId, type, channel) {
  const out = await createCustomerMessageDraft(orderId, type, channel);
  if (!out.ok || !out.id) return null;
  return { id: out.id };
}

module.exports = {
  generateCustomerMessage,
  createCustomerMessageDraft,
  persistDraftMessage,
  MESSAGE_TYPES,
  ALLOWED_TYPES: MESSAGE_TYPES,
};
