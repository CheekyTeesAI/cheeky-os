"use strict";

/**
 * Phase 0 — static system map (Cheeky OS Connection v1.2).
 * Derived from repo scan; update when adding major paths.
 */
const SYSTEM_MAP = Object.freeze({
  inbound_sources: [
    "POST /api/cheeky/inbound/email (cheeky-os server)",
    "POST /api/intake/outlook-webhook",
    "POST /api/intake/* (email pipeline)",
    "src/api/webhooks.square.ts POST /cheeky/webhooks/square (legacy)",
  ],
  webhook_routes: [
    "POST /api/square/webhook (canonical raw + HMAC — cheeky-os mount)",
    "POST /webhooks/square/webhook (mirror — same handler)",
    "POST /webhooks/square (JSON legacy — src/routes/square.webhook.ts)",
    "POST /api/square (squareWebhook router)",
    "POST /api/square-sync/* (squareSync.router)",
    "POST /cheeky/webhooks/square (webhooks.square)",
    "POST /api/cheeky-webhooks/*",
    "POST /payments/webhook (cheeky-os routes/payments.js)",
  ],
  square_handlers: [
    "dist/services/squareWebhookService.processSquareWebhook",
    "squareSync/squareSync.service.handleSquareWebhookEvent",
    "dist/services/squarePaymentHandler.handleSquarePaymentWebhook",
    "src/webhooks/squareWebhook.js mountCanonicalInvoiceRaw",
    "src/routes/squareWebhook.ts (TypeScript router)",
  ],
  order_creation_points: [
    "src/services/squarePaymentHandler.ts db.order.create (payment.completed)",
    "src/api/orders.create.ts",
    "lib/orderEngine.createOrderFromPayment",
    "cheeky-os/routes/capture.js createOrderFromCapture",
    "cheeky-os/src/operator/leadIntake.js prisma.order.create",
    "cheeky-os/services/cashToOrder.loop.service ensureOrderFromPayment (v1.2)",
  ],
  payment_detection: [
    "squareWebhookService (invoice.updated / payment.updated / invoice.payment_made)",
    "squareSync.mapper normalizeSquarePayment / normalizeSquareInvoice",
    "squareSync.service.syncPaymentToOrder",
    "cheeky-os/payments/square-sync.js processPaymentEvent",
  ],
  ai_processors: [
    "cheeky-os/services/closer.*.service",
    "cheeky-os/services/followup.ai.service",
    "cheeky-os/services/ai.decision.service",
    "src/routes/decision.route",
  ],
  storage_layers: [
    "PostgreSQL Prisma (email-intake/prisma/schema.prisma)",
    "cheeky-os/data/runtime/*.json (queues)",
    "CHEEKY_MARKETING_DATABASE_URL sqlite (legacy marketing prisma)",
    "email-intake/data/*.json (legacy JSON stores)",
  ],
  duplicates: [
    "Multiple Square webhook HTTP paths (routed to same processSquareWebhook in v1.2 lock)",
    "squareSync.handleSquareWebhookEvent + processSquareWebhook (sync is post-hook; both may touch orders)",
  ],
  risks: [
    "Prisma client / tsc drift if schema out of sync",
    "HMAC notification URL must match Square dashboard subscription URL",
    "Order created without prior quote if payment.completed fires with insufficient invoice context",
  ],
});

module.exports = { SYSTEM_MAP };
