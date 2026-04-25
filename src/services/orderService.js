"use strict";

const crypto = require("crypto");
const { getPrisma, runDecisionEngineInTransaction } = require("./decisionEngine");
const { computeRoutingHint } = require("./routingService");
const { buildEstimate } = require("./autoEstimateService");
const { createDraftInvoice } = require("./squareService");
const { generatePortalToken } = require("./portalTokenService");

function buildQuickEmail(phone) {
  const h = crypto.createHash("sha256").update(String(phone || "")).digest("hex").slice(0, 28);
  return `quick-${h}@cheeky-intake.local`;
}

/**
 * POST /api/orders/quick — customer + order + line + route + decision engine (same transaction).
 */
async function createQuickOrder(body) {
  const name = String(body.name || body.customerName || "").trim();
  const phone = String(body.phone || "").trim();
  const qty = Math.max(1, parseInt(String(body.qty || body.quantity || "1"), 10) || 1);
  const product = String(body.product || "").trim();
  const notes = String(body.notes || "").trim();
  const description = String(body.description || product || notes || "").trim();
  const inputEmail = String(body.email || "").trim();
  const explicitProductionType = String(body.productionType || "").trim();
  if (!name || !phone || !description) {
    return { success: false, error: "name, phone, and description are required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  const email = inputEmail || buildQuickEmail(phone);
  const route = computeRoutingHint({ description, qty });
  const productionType = explicitProductionType || route.productionType;

  try {
    const result = await prisma.$transaction(async (tx) => {
      let customer = await tx.customer.findUnique({ where: { email } });
      if (!customer) {
        customer = await tx.customer.create({
          data: { name, email, phone },
        });
      }
      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          customerName: name,
          phone,
          email,
          quantity: qty,
          notes: description,
          printMethod: productionType,
          lineItems: {
            create: [
              {
                description,
                quantity: qty,
                unitPrice: 0,
                productionType,
              },
            ],
          },
        },
        include: { lineItems: true },
      });

      await tx.productionRoute.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          routeStatus: "ROUTED",
          productionType,
          assignee: "Jeremy",
          rationale: route.rationale,
        },
        update: {
          routeStatus: "ROUTED",
          productionType,
          assignee: "Jeremy",
          rationale: route.rationale,
        },
      });

      const finalOrder = await runDecisionEngineInTransaction(tx, order.id);
      return { customer, order: finalOrder };
    });

    try {
      const estimate = await buildEstimate(result.order);
      const invoice = await createDraftInvoice(result.order, estimate);
      const invoiceId = invoice && invoice.invoice ? invoice.invoice.id : null;
      if (invoiceId) {
        await prisma.order.update({
          where: { id: result.order.id },
          data: {
            squareInvoiceId: invoiceId,
          },
        });
        result.order.squareInvoiceId = invoiceId;
      }
    } catch (e) {
      console.log("Estimate/Invoice skipped:", e && e.message ? e.message : e);
    }

    try {
      if (!result.order.portalToken) {
        const token = generatePortalToken();
        await prisma.order.update({
          where: { id: result.order.id },
          data: { portalToken: token },
        });
        result.order.portalToken = token;
      }
    } catch (e) {
      console.log("Portal token assignment skipped:", e && e.message ? e.message : e);
    }

    // [CHEEKY-GATE] Compute lifecycle tasks from current order state.
    // Surfaces next-action tasks in the API response without DB writes.
    // DB persistence wired in a later phase once Job record pattern is established.
    try {
      const CHEEKY_getLifecycleTasks = require("./taskAutogenService").generateTasksForOrder;
      result.order.pendingTasks = CHEEKY_getLifecycleTasks(result.order);
      console.log("[CHEEKY-GATE] pendingTasks:", JSON.stringify(result.order.pendingTasks));
    } catch (_) {
      result.order.pendingTasks = [];
    }

    return { success: true, data: result };
  } catch (e) {
    console.error("[orderService.createQuickOrder]", e && e.stack ? e.stack : e);
    return {
      success: false,
      error: e && e.message ? e.message : "create_quick_order_failed",
      code: "ORDER_CREATE_FAILED",
    };
  }
}

// [CHEEKY-GATE] CHEEKY_listOrders — service-layer wrapper for order list queries.
// Moves direct Prisma access out of route handlers into the service layer.
async function CHEEKY_listOrders({ take = 200, orderBy = { createdAt: "desc" } } = {}) {
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE", data: null };
  }
  try {
    const orders = await prisma.order.findMany({ orderBy, take });
    return { success: true, data: orders };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : "list_orders_failed",
      code: "QUERY_FAILED",
      data: null,
    };
  }
}

module.exports = {
  createQuickOrder,
  computeRoutingHint,
  CHEEKY_listOrders,
};
