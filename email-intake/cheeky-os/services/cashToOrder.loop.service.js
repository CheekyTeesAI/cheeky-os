"use strict";

/**
 * Cheeky OS Connection v1.2 — cash → order loop helpers (additive).
 * IRON LAW: no new order without deposit ≥ 50% when invoice/total is known.
 */

const path = require("path");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function extractPaymentData(event) {
  try {
    const data = (event && event.data) || {};
    const obj = data.object || {};
    return {
      eventId: event.event_id || event.eventId || null,
      type: event.type || event.event_type || event.eventType || null,
      payment: obj.payment || null,
      invoice: obj.invoice || null,
      raw: event,
    };
  } catch (_) {
    return {
      eventId: null,
      type: null,
      payment: null,
      invoice: null,
      raw: event,
    };
  }
}

function moneyToNum(m) {
  if (!m || typeof m !== "object") return null;
  const amt = m.amount;
  if (typeof amt === "bigint") return Number(amt) / 100;
  if (typeof amt === "number" && Number.isFinite(amt)) return amt / 100;
  return null;
}

/**
 * Deposit ≥ 50% of known order/invoice total, or paid > 0 when total unknown (conservative allow for gateway events).
 */
function hasSufficientDeposit(payload) {
  try {
    const inv = payload && payload.invoice;
    const pay = payload && payload.payment;
    let total = null;
    let paid = null;
    if (inv) {
      const t = moneyToNum(inv.total_money || inv.totalMoney);
      const p = moneyToNum(
        inv.amount_paid_money ||
          inv.amountPaidMoney ||
          inv.total_completed_amount_money ||
          inv.totalCompletedAmountMoney
      );
      if (t != null && t > 0) total = t;
      if (p != null && p >= 0) paid = p;
    }
    if (pay) {
      const pAdd = moneyToNum(pay.amount_money || pay.total_money || pay.totalMoney);
      if (paid == null && pAdd != null) paid = pAdd;
      const tAdd = moneyToNum(pay.total_money || pay.totalMoney);
      if (total == null && tAdd != null && tAdd > 0) total = tAdd;
    }
    if (total != null && total > 0 && paid != null) {
      return paid + 1e-6 >= total * 0.5;
    }
    if (paid != null && paid > 0) {
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

/**
 * @param {object} wrapper — { payment, invoice?, raw? }
 */
async function ensureOrderFromPayment(wrapper) {
  const summary = { ok: false, reason: "init" };
  try {
    const prisma = getPrisma();
    const pay = wrapper && wrapper.payment;
    if (!prisma) {
      summary.reason = "no_prisma";
      return summary;
    }
    if (!pay || typeof pay.id !== "string" || !pay.id.trim()) {
      summary.reason = "no_payment_id";
      return summary;
    }
    const squarePaymentId = pay.id.trim();
    const invId =
      wrapper.invoice && typeof wrapper.invoice.id === "string"
        ? wrapper.invoice.id.trim()
        : null;

    const existing = await prisma.order.findFirst({
      where: {
        OR: [
          { squareId: squarePaymentId },
          ...(invId ? [{ squareInvoiceId: invId }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing) {
      summary.ok = true;
      summary.skipped = true;
      summary.reason = "ORDER_SKIPPED_DUPLICATE";
      summary.orderId = existing.id;
      console.log("[cash-to-order] ORDER_SKIPPED_DUPLICATE orderId=" + existing.id);
      return summary;
    }

    if (!hasSufficientDeposit(wrapper)) {
      summary.reason = "insufficient_deposit_50pct";
      console.log("[cash-to-order] ORDER_SKIPPED insufficient_deposit_50pct");
      return summary;
    }

    const synthetic = {
      type: "payment.completed",
      data: { object: { payment: pay } },
    };

    const handlerPath = path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "squarePaymentHandler"
    );
    const handler = require(handlerPath);
    if (!handler || typeof handler.handleSquarePaymentWebhook !== "function") {
      summary.reason = "handler_missing";
      return summary;
    }
    const r = await handler.handleSquarePaymentWebhook(synthetic);
    if (r && r.duplicate) {
      summary.ok = true;
      summary.skipped = true;
      summary.reason = "ORDER_SKIPPED_DUPLICATE";
      console.log("[cash-to-order] ORDER_SKIPPED_DUPLICATE (handler)");
      return summary;
    }
    if (r && r.skipped) {
      summary.reason = "handler_skipped";
      return summary;
    }
    summary.ok = true;
    summary.created = true;
    summary.reason = "ORDER_CREATED";
    console.log("[cash-to-order] ORDER_CREATED via payment webhook bridge");
    return summary;
  } catch (e) {
    summary.reason = e && e.message ? e.message : String(e);
    console.warn("[cash-to-order] ensureOrderFromPayment error:", summary.reason);
    return summary;
  }
}

async function routeOrderConnection(orderId) {
  try {
    const prisma = getPrisma();
    if (!prisma || !orderId) return;
    const { determineProductionRoute } = require(path.join(
      __dirname,
      "..",
      "..",
      "productionRouting",
      "routing.rules"
    ));
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        printMethod: true,
        garmentType: true,
        quantity: true,
        isRush: true,
        notes: true,
        amountPaid: true,
        totalAmount: true,
        depositReceived: true,
        depositStatus: true,
        completedAt: true,
        updatedAt: true,
      },
    });
    if (!order) return;
    const route = determineProductionRoute(order);
    const method = route.method || "DTG";
    await prisma.order.update({
      where: { id: orderId },
      data: { productionTypeFinal: String(method) },
    });
    console.log(
      "[cash-to-order] ORDER_ROUTED: " +
        orderId +
        " method=" +
        method +
        " assignee=" +
        (route.assignee || "")
    );
  } catch (e) {
    console.warn(
      "[cash-to-order] routeOrderConnection:",
      e && e.message ? e.message : e
    );
  }
}

async function afterOrderPaymentHook(orderId, _payload) {
  await routeOrderConnection(orderId);
}

async function tryEnsureOrderAfterWebhookNoMatch(payload, extract) {
  try {
    const pay =
      (extract && extract.payment) ||
      (payload &&
        payload.data &&
        payload.data.object &&
        payload.data.object.payment);
    if (!pay || typeof pay.id !== "string") {
      return;
    }
    const wrapper = {
      payment: pay,
      invoice:
        (extract && extract.invoice) ||
        (payload &&
          payload.data &&
          payload.data.object &&
          payload.data.object.invoice),
      raw: payload,
    };
    if (!hasSufficientDeposit(wrapper)) {
      console.log("[cash-to-order] post_webhook ensure skipped (50% / amount signal)");
      return;
    }
    await ensureOrderFromPayment(wrapper);
  } catch (e) {
    console.warn(
      "[cash-to-order] tryEnsureOrderAfterWebhookNoMatch:",
      e && e.message ? e.message : e
    );
  }
}

module.exports = {
  extractPaymentData,
  hasSufficientDeposit,
  ensureOrderFromPayment,
  routeOrderConnection,
  afterOrderPaymentHook,
  tryEnsureOrderAfterWebhookNoMatch,
};
