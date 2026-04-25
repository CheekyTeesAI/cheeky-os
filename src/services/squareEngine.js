"use strict";

const crypto = require("crypto");
const { getPrisma, runDecisionEngineInTransaction } = require("./decisionEngine");

const { OrderDepositStatus } = require("@prisma/client");

function verifySquareSignature(rawBody, signatureHeader, notificationUrl) {
  if (process.env.SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY === "true") {
    return;
  }
  const key = String(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "").trim();
  if (!key) return;
  const url = String(
    process.env.SQUARE_WEBHOOK_NOTIFICATION_URL || notificationUrl || ""
  ).trim();
  if (!url) {
    throw new Error(
      "Square webhook: set SQUARE_WEBHOOK_NOTIFICATION_URL when SQUARE_WEBHOOK_SIGNATURE_KEY is set"
    );
  }
  if (!signatureHeader || !String(signatureHeader).trim()) {
    throw new Error("Square webhook: missing x-square-hmacsha256-signature header");
  }
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
  const payload = `${url}${body}`;
  const digest = crypto.createHmac("sha256", key).update(payload, "utf8").digest("base64");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(String(signatureHeader).trim(), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid Square webhook signature");
  }
}

function asRecord(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function extractEventId(payload) {
  const p = asRecord(payload);
  if (!p) return null;
  const raw = p.event_id ?? p.eventId ?? p.id;
  const s = typeof raw === "string" ? raw.trim() : "";
  return s || null;
}

function extractEventType(payload) {
  const p = asRecord(payload);
  if (!p) return null;
  const raw = p.type ?? p.event_type ?? p.eventType;
  return typeof raw === "string" ? raw.trim() : null;
}

function getDataObject(payload) {
  const p = asRecord(payload);
  const data = asRecord(p?.data);
  return asRecord(data?.object);
}

function extractSquareOrderId(payload) {
  const obj = getDataObject(payload);
  const pay = asRecord(obj?.payment);
  const inv = asRecord(obj?.invoice);
  const raw =
    pay?.order_id ??
    pay?.orderId ??
    inv?.order_id ??
    inv?.orderId ??
    obj?.order_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function extractSquarePaymentId(payload) {
  const obj = getDataObject(payload);
  const pay = asRecord(obj?.payment);
  const raw = pay?.id ?? pay?.payment_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Manual deposit (drafts / in-shop): marks deposit received and runs decision engine in one transaction.
 */
async function applyManualDeposit(orderId) {
  const id = String(orderId || "").trim();
  if (!id) {
    return { success: false, error: "orderId required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const order = await prisma.$transaction(async (tx) => {
      const cur = await tx.order.findUnique({ where: { id } });
      if (!cur) {
        throw new Error("ORDER_NOT_FOUND");
      }
      const totalAmt = cur.totalAmount ?? 0;
      const quoted = cur.quotedAmount;
      const depositReq =
        cur.depositRequired != null && cur.depositRequired > 0
          ? Number(cur.depositRequired)
          : totalAmt > 0
            ? totalAmt * 0.5
            : quoted != null && quoted > 0
              ? quoted * 0.5
              : 0;
      const targetDeposit = depositReq > 0 ? depositReq : Math.max(totalAmt, quoted || 0, 1);
      await tx.order.update({
        where: { id },
        data: {
          depositReceived: true,
          depositPaid: true,
          depositStatus: OrderDepositStatus.PAID,
          depositPaidAt: cur.depositPaidAt ?? new Date(),
          amountPaid: Math.max(cur.amountPaid ?? 0, targetDeposit),
        },
      });
      return runDecisionEngineInTransaction(tx, id);
    });
    return { success: true, data: { order } };
  } catch (e) {
    console.error("[squareEngine.applyManualDeposit]", e && e.stack ? e.stack : e);
    const msg = e && e.message ? e.message : "deposit_failed";
    const code = msg === "ORDER_NOT_FOUND" ? "NOT_FOUND" : "DEPOSIT_FAILED";
    return { success: false, error: msg, code };
  }
}

/**
 * Supplemental JSON webhook (legacy-style body): idempotent on event_id, matches order by Square ids, applies deposit + decision.
 * Use canonical POST /api/square/webhook when possible; this is a fallback path mounted at /api/cheeky-webhooks/square.
 */
async function processLegacyPaymentJsonPayload(payload) {
  const eventId = extractEventId(payload);
  if (!eventId) {
    return { success: false, error: "Missing event id", code: "MISSING_EVENT_ID" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  const existing = await prisma.processedWebhookEvent.findUnique({ where: { id: eventId } });
  if (existing) {
    console.log(`[squareEngine] idempotent skip eventId=${eventId}`);
    return { success: true, data: { duplicate: true } };
  }
  const sqOrderId = extractSquareOrderId(payload);
  const sqPaymentId = extractSquarePaymentId(payload);
  let order =
    sqOrderId != null
      ? await prisma.order.findFirst({ where: { squareOrderId: sqOrderId } })
      : null;
  if (!order && sqPaymentId) {
    order = await prisma.order.findFirst({ where: { squarePaymentId: sqPaymentId } });
  }
  if (!order) {
    console.log("[squareEngine] no order match for legacy payload");
    return { success: false, error: "No matching order", code: "NO_ORDER" };
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const cur = await tx.order.findUnique({ where: { id: order.id } });
      if (!cur) throw new Error("ORDER_NOT_FOUND");
      const totalAmt = cur.totalAmount ?? 0;
      const quoted = cur.quotedAmount;
      const depositReq =
        cur.depositRequired != null && cur.depositRequired > 0
          ? Number(cur.depositRequired)
          : totalAmt > 0
            ? totalAmt * 0.5
            : quoted != null && quoted > 0
              ? quoted * 0.5
              : 0;
      const target = depositReq > 0 ? depositReq : Math.max(totalAmt, quoted || 0, 1);
      await tx.order.update({
        where: { id: order.id },
        data: {
          depositReceived: true,
          depositPaid: true,
          depositStatus: OrderDepositStatus.PAID,
          depositPaidAt: cur.depositPaidAt ?? new Date(),
          amountPaid: Math.max(cur.amountPaid ?? 0, target),
          squarePaymentId: sqPaymentId || cur.squarePaymentId,
          squareOrderId: sqOrderId || cur.squareOrderId,
        },
      });
      const decided = await runDecisionEngineInTransaction(tx, order.id);
      await tx.processedWebhookEvent.create({
        data: { id: eventId, eventType: extractEventType(payload) || "unknown" },
      });
      return decided;
    });
    return { success: true, data: { order: updated } };
  } catch (e) {
    if (e && e.code === "P2002") {
      return { success: true, data: { duplicate: true } };
    }
    console.error("[squareEngine.processLegacyPaymentJsonPayload]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "webhook_failed", code: "WEBHOOK_FAILED" };
  }
}

module.exports = {
  verifySquareSignature,
  applyManualDeposit,
  processLegacyPaymentJsonPayload,
  extractEventId,
};
