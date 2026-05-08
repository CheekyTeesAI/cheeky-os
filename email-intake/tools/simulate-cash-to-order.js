"use strict";

/**
 * Cash → order simulation (no HTTP). Uses same pipeline as POST /webhooks/square/webhook.
 *
 * Run from email-intake:
 *   node tools/simulate-cash-to-order.js
 *
 * Requires: DATABASE_URL (or Prisma env), dist/services compiled.
 */

const path = require("path");

const ROOT = path.join(__dirname, "..");
const prismaPath = path.join(ROOT, "src", "lib", "prisma");
const squareWebhookPath = path.join(ROOT, "src", "webhooks", "squareWebhook");
const loopPath = path.join(ROOT, "cheeky-os", "services", "cashToOrder.loop.service");

function pickStamp() {
  return `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  const out = {
    cashToOrder: "FAIL",
    depositEnforced: false,
    idempotency: false,
    routingAssigned: false,
    orderVisibleInApi: false,
    detail: null,
  };

  let prisma;
  let orderId;
  let eventId;
  const { runCanonicalSquareWebhookPipeline } = require(squareWebhookPath);
  const { hasSufficientDeposit } = require(loopPath);

  try {
    prisma = require(prismaPath);
    if (!prisma || typeof prisma.order !== "object") {
      throw new Error("Prisma client not available");
    }
  } catch (e) {
    out.detail = "prisma_load: " + (e && e.message ? e.message : String(e));
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  const invId = pickStamp();
  eventId = pickStamp();
  const email = `sim.${pickStamp()}@cash-order.test`;

  try {
    const order = await prisma.order.create({
      data: {
        customerName: "CashToOrder Sim",
        email,
        notes: "simulate-cash-to-order.js",
        status: "INTAKE",
        totalAmount: 200,
        amountTotal: 200,
        quotedAmount: 200,
        depositRequired: 100,
        amountPaid: 0,
        squareInvoiceId: invId,
        printMethod: "DTG",
        garmentType: "POLYESTER",
        quantity: 30,
      },
    });
    orderId = order.id;

    const payload = {
      event_id: eventId,
      type: "invoice.updated",
      data: {
        object: {
          invoice: {
            id: invId,
            status: "PARTIALLY_PAID",
            total_money: { amount: 20000 },
            amount_paid_money: { amount: 10000 },
          },
        },
      },
    };

    const depositPayload = {
      invoice: payload.data.object.invoice,
      payment: null,
      raw: payload,
    };
    out.depositEnforced = hasSufficientDeposit(depositPayload);
    if (!out.depositEnforced) {
      throw new Error("hasSufficientDeposit returned false for 50% case");
    }

    const run1 = await runCanonicalSquareWebhookPipeline(payload, "simulate_first");
    if (!run1.result.success) {
      throw new Error("first webhook run failed: " + (run1.result.message || ""));
    }

    const after = await prisma.order.findUnique({ where: { id: orderId } });
    const paidOk = Number(after.amountPaid || 0) >= 99;
    const depositPaid =
      String(after.depositStatus || "").toUpperCase() === "PAID" ||
      after.status === "PRODUCTION_READY" ||
      after.status === "DEPOSIT_PAID";

    const run2 = await runCanonicalSquareWebhookPipeline(payload, "simulate_second");
    if (!run2.result.success || run2.result.message !== "already processed") {
      throw new Error(
        "idempotency: expected already processed, got " +
          JSON.stringify(run2.result).slice(0, 200)
      );
    }
    out.idempotency = true;

    const { afterOrderPaymentHook } = require(loopPath);
    await afterOrderPaymentHook(orderId, payload);

    const routed = await prisma.order.findUnique({
      where: { id: orderId },
      select: { productionTypeFinal: true, amountPaid: true, depositStatus: true, status: true },
    });
    out.routingAssigned = Boolean(routed && routed.productionTypeFinal);
    out.orderVisibleInApi = paidOk && depositPaid && Boolean(orderId);
    out.cashToOrder = out.routingAssigned && out.idempotency && out.depositEnforced ? "PASS" : "FAIL";

    if (!paidOk || !depositPaid) {
      out.detail = "order not fully transitioned " + JSON.stringify(routed);
    }
  } catch (e) {
    out.detail = e && e.message ? e.message : String(e);
    out.cashToOrder = "FAIL";
  } finally {
    try {
      if (prisma && eventId) {
        await prisma.processedWebhookEvent.deleteMany({ where: { id: eventId } }).catch(() => {});
      }
      if (prisma && orderId) {
        await prisma.order.deleteMany({ where: { id: orderId } }).catch(() => {});
      }
    } catch (_) {}
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.cashToOrder === "PASS" ? 0 : 1);
}

main();
