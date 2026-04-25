"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Signature failure behavior aligned to 401
// - Deposit timestamps enforced before production unlock

const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { getPrisma } = require("../services/decisionEngine");
const { createProductionJob } = require("../services/productionService");
const { logAction } = require("../services/auditService");
const { updateOrderFinancials } = require("../services/financeService");

const router = express.Router();

function verifySignature(body, signature, url, key) {
  if (!key || !signature || !url) return false;

  const hmac = crypto.createHmac("sha256", key);
  hmac.update(url + body);
  const expected = hmac.digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeInvoiceId(event) {
  return (
    event &&
    event.data &&
    event.data.object &&
    event.data.object.invoice_payment &&
    event.data.object.invoice_payment.invoice_id
  ) || null;
}

router.post("/webhooks/square", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) return res.status(200).json({ success: false, code: "DB_UNAVAILABLE" });

    const signature = req.headers["x-square-hmacsha256-signature"];
    const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");

    const isValid = verifySignature(
      body,
      signature,
      process.env.SQUARE_WEBHOOK_NOTIFICATION_URL,
      process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
    );

    if (!isValid) {
      console.log("[WEBHOOK] Invalid signature");
      return res.status(401).send("Invalid signature");
    }

    let event;
    try {
      event = JSON.parse(body);
    } catch (_e) {
      console.log("[WEBHOOK] Malformed event body ignored");
      return res.status(200).json({ success: false, code: "INVALID_JSON" });
    }

    try {
      const processSquarePaymentWebhook = require(path.join(
        __dirname,
        "..",
        "..",
        "email-intake",
        "cheeky-os",
        "src",
        "actions",
        "processSquarePaymentWebhook"
      ));
      await processSquarePaymentWebhook(event || {});
    } catch (e) {
      console.log("[Square Sync Non-Fatal Error]", e && e.message ? e.message : e);
    }

    const eventType = String((event && event.type) || "");
    const eventId = String((event && event.event_id) || (event && event.id) || "").trim();
    console.log("[WEBHOOK EVENT]", eventType || "UNKNOWN");

    if (!eventType) {
      return res.status(200).json({ success: true, ignored: "missing_event_type" });
    }

    // Idempotency: if we already processed this event id, safely ignore.
    if (eventId) {
      const already = await prisma.processedWebhookEvent.findUnique({ where: { id: eventId } });
      if (already) {
        console.log("[WEBHOOK] Already processed event", eventId);
        return res.status(200).json({ success: true, duplicate: true });
      }
    }

    if (eventType === "invoice.payment_made") {
      const invoiceId = normalizeInvoiceId(event);
      if (!invoiceId) {
        return res.status(200).json({ success: true, ignored: "missing_invoice_id" });
      }

      const order = await prisma.order.findFirst({
        where: { squareInvoiceId: invoiceId },
      });

      if (!order) {
        console.log("[WEBHOOK] Order not found for invoice", invoiceId);
      } else if (order.depositPaid) {
        console.log("[WEBHOOK] Already paid", order.id);
        try {
          const job = await createProductionJob(order.id);
          console.log("[WEBHOOK] Production job ensured", job.id);
        } catch (jobErr) {
          console.log(
            "[WEBHOOK] Production job skipped",
            jobErr && jobErr.message ? jobErr.message : jobErr
          );
        }
      } else {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            depositPaid: true,
            depositPaidAt: new Date(),
            status: "PRODUCTION_READY",
            nextAction: "Order garments",
            nextOwner: "Jeremy",
            blockedReason: null,
          },
        });
        await updateOrderFinancials(order.id);
        await logAction("PAYMENT_RECEIVED", "Order", order.id, {
          invoice: order.squareInvoiceId,
        });
        console.log("[WEBHOOK] Deposit received -> Order unlocked", order.id);
        try {
          const job = await createProductionJob(order.id);
          console.log("[WEBHOOK] Production job created", job.id);
          try {
            const { autoScheduleJobs } = require("../services/schedulerService");
            await autoScheduleJobs();
          } catch (_e) {
            // optional scheduling hook
          }
        } catch (jobErr) {
          console.log(
            "[WEBHOOK] Production job skipped",
            jobErr && jobErr.message ? jobErr.message : jobErr
          );
        }
      }
    } else {
      // Gracefully ignore unknown event types.
      console.log("[WEBHOOK] Ignored event type", eventType);
    }

    if (eventId) {
      await prisma.processedWebhookEvent.create({
        data: {
          id: eventId,
          eventType,
        },
      });
    }

    return res.status(200).json({ success: true });
  } catch (e) {
    console.log("[WEBHOOK ERROR]", e && e.message ? e.message : e);
    return res.status(200).json({ success: false });
  }
});

module.exports = router;
