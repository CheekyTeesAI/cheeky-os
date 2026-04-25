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

// [CHEEKY-GATE] CHEEKY_advanceOrderSmart — pure extraction of the advance-smart transaction.
// Routing logic is NOT duplicated here; caller passes productionRoutingForOrder as routeFn.
async function CHEEKY_advanceOrderSmart(id, routeFn) {
  if (!id || typeof id !== "string" || !id.trim()) {
    return { success: false, error: "order id required", code: "VALIDATION_ERROR" };
  }
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const out = await prisma.$transaction(async (tx) => {
      const cur = await tx.order.findUnique({ where: { id } });
      if (!cur) throw new Error("ORDER_NOT_FOUND");
      if (!cur.depositPaid && !cur.depositReceived) {
        await tx.order.update({
          where: { id },
          data: {
            depositPaid: true,
            depositReceived: true,
            depositStatus: "PAID",
            depositPaidAt: cur.depositPaidAt || new Date(),
          },
        });
      } else if (!cur.garmentsOrdered) {
        await tx.order.update({
          where: { id },
          data: {
            garmentsOrdered: true,
            garmentOrderPlacedAt: cur.garmentOrderPlacedAt || new Date(),
          },
        });
      } else if (cur.garmentsOrdered && !cur.garmentsReceived) {
        await tx.order.update({
          where: { id },
          data: {
            garmentsReceived: true,
            garmentOrderReceivedAt: cur.garmentOrderReceivedAt || new Date(),
          },
        });
      } else if (cur.garmentsReceived && !cur.productionComplete) {
        await tx.order.update({
          where: { id },
          data: { productionComplete: true, productionCompletedAt: cur.productionCompletedAt || new Date() },
        });
      } else if (cur.productionComplete && !cur.qcComplete) {
        await tx.order.update({ where: { id }, data: { qcComplete: true } });
      }
      const order = await runDecisionEngineInTransaction(tx, id);
      const prodStatuses = new Set(["PRODUCTION_READY", "WAITING_GARMENTS", "WAITING_ART", "PRINTING", "QC", "READY"]);
      if (order && prodStatuses.has(String(order.status || "").toUpperCase())) {
        const existing = await tx.productionJob.findFirst({
          where: { orderId: id, status: { not: "COMPLETE" } },
          select: { id: true },
        });
        if (!existing) {
          const route = typeof routeFn === "function" ? routeFn(order) : {};
          await tx.productionJob.create({
            data: {
              orderId: id,
              type: route.type,
              status: "READY",
              assignedTo: route.assignedTo,
              vendorName: route.vendorName,
              vendorEmail: route.vendorEmail,
              packetStatus: route.packetStatus,
              notes: "Auto-created from order transition to PRODUCTION_READY",
            },
          });
        }
      }
      return { order };
    });
    return { success: true, data: out };
  } catch (err) {
    const msg = err && err.message ? err.message : "advance_failed";
    return {
      success: false,
      error: msg,
      code: msg === "ORDER_NOT_FOUND" ? "NOT_FOUND" : "TRANSACTION_FAILED",
    };
  }
}

// [CHEEKY-GATE] CHEEKY_listPayableOrders — extracted from GET /api/payments route.
// Returns orders that have a Square invoice, mapped to payment panel shape.
async function CHEEKY_listPayableOrders() {
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE", data: null };
  }
  try {
    const orders = await prisma.order.findMany({
      where: { squareInvoiceId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return {
      success: true,
      data: (orders || []).map((o) => ({
        id: o.id,
        customerName: o.customerName,
        squareInvoiceId: o.squareInvoiceId,
        paymentLink: o.paymentLink || null,
        depositAmount: o.depositAmount || null,
        depositPaid: Boolean(o.depositPaid),
        status: o.status,
      })),
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : "payments_fetch_failed",
      code: "PAYMENTS_FETCH_FAILED",
      data: null,
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

// [CHEEKY-GATE] CHEEKY_sendFollowupReminder — extracted from POST /send/:orderId.
// Pure relocation: order lookup + channel-dispatch to communicationService.
async function CHEEKY_sendFollowupReminder(orderId, channel) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const order = await prisma.order.findUnique({ where: { id: String(orderId || "") } });
  if (!order) return { success: false, error: "Order not found", code: "ORDER_NOT_FOUND" };
  let communicationService;
  try { communicationService = require("./communicationService"); } catch (_) { communicationService = null; }
  if (!communicationService) return { success: false, error: "communicationService unavailable", code: "SERVICE_UNAVAILABLE" };
  let result;
  if (String(channel || "").toUpperCase() === "SMS") {
    result = await communicationService.sendSmsReminder(order);
  } else {
    result = await communicationService.sendEmailReminder(order);
  }
  return { success: true, data: { result } };
}

// [CHEEKY-GATE] CHEEKY_markFollowupDone — extracted from POST /done/:orderId.
// Pure relocation: order.update followupDone = true.
async function CHEEKY_markFollowupDone(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const updated = await prisma.order.update({
    where: { id: String(orderId || "") },
    data: { followupDone: true },
  });
  return { success: true, data: { orderId: updated.id, followupDone: updated.followupDone } };
}

// [CHEEKY-GATE] CHEEKY_listPrintQueue — extracted from GET /api/print/queue.
// Pure relocation: order.findMany garmentsReceived + !productionComplete.
async function CHEEKY_listPrintQueue() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE", data: null };
  const orders = await prisma.order.findMany({
    where: { garmentsReceived: true, productionComplete: false },
    include: { lineItems: true },
    take: 500,
  });
  return { success: true, data: orders };
}

// [CHEEKY-GATE] CHEEKY_listPickupReady — extracted from GET /api/pickup.
// Pure relocation: order.findMany readyForPickup = true.
async function CHEEKY_listPickupReady() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE", data: null };
  const list = await prisma.order.findMany({
    where: { readyForPickup: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { success: true, data: list };
}

// [CHEEKY-GATE] CHEEKY_markPickupNotified — extracted from POST /api/pickup/:id/notified.
// Pure relocation: order.update pickupNotified = true.
async function CHEEKY_markPickupNotified(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE", data: null };
  const updated = await prisma.order.update({
    where: { id: String(orderId || "") },
    data: { pickupNotified: true },
  });
  return { success: true, data: updated };
}

// [CHEEKY-GATE] CHEEKY_getDailyReport — extracted from GET /api/reports/os/daily + /api/reports/daily.
// Pure relocation: 4 parallel order queries (aggregate + count + 2 findMany).
async function CHEEKY_getDailyReport() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const [atRiskAgg, atRiskCount, stuck, actions] = await Promise.all([
    prisma.order.aggregate({
      where: { deletedAt: null, depositReceived: false, quotedAmount: { gt: 0 } },
      _sum: { quotedAmount: true },
    }),
    prisma.order.count({ where: { deletedAt: null, depositReceived: false, quotedAmount: { gt: 0 } } }),
    prisma.order.findMany({
      where: { deletedAt: null, status: { notIn: ["READY", "COMPLETED", "CANCELLED", "PAID_IN_FULL"] }, updatedAt: { lt: new Date(Date.now() - 3 * 86400000) } },
      take: 20,
      select: { id: true, orderNumber: true, status: true, nextAction: true, nextOwner: true, updatedAt: true, quotedAmount: true },
    }),
    prisma.order.findMany({ where: { deletedAt: null, nextAction: { not: null } }, select: { nextAction: true } }),
  ]);
  const actionCounts = {};
  for (const row of actions) { const k = row.nextAction || ""; actionCounts[k] = (actionCounts[k] || 0) + 1; }
  const top3 = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([action, count]) => ({ action, count }));
  return { success: true, data: { revenueAtRisk: { estimatedTotal: (atRiskAgg._sum && atRiskAgg._sum.quotedAmount) || 0, orderCount: atRiskCount }, stuckOrders: stuck, topActions: top3 } };
}

// [CHEEKY-GATE] CHEEKY_listProductionQueueV33 — extracted from GET /api/production/queue (v3.3).
async function CHEEKY_listProductionQueueV33() {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const rows = await prisma.order.findMany({
    where: { nextOwner: "Jeremy", status: "PRINTING", garmentsReceived: true, productionComplete: false, OR: [{ depositReceived: true }, { depositPaid: true }, { depositStatus: "PAID" }] },
    orderBy: [{ garmentsReceived: "desc" }, { depositPaid: "desc" }],
    take: 150,
    select: { id: true, customerName: true, nextAction: true, nextOwner: true, status: true, blockedReason: true, garmentsReceived: true, depositReceived: true, depositPaid: true, printMethod: true, updatedAt: true },
  });
  return { success: true, data: { queue: rows, engine: "v3.3" } };
}

// [CHEEKY-GATE] CHEEKY_getPortalOrder — extracted from GET /api/portal/:token.
async function CHEEKY_getPortalOrder(token) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const order = await prisma.order.findFirst({ where: { portalToken: String(token || ""), portalEnabled: true }, include: { lineItems: true, artFiles: true } });
  if (!order) return { success: false, error: "Portal link not found", code: "PORTAL_NOT_FOUND" };
  return { success: true, data: order };
}

// [CHEEKY-GATE] CHEEKY_approvePortalArt — extracted from POST /api/portal/:token/art/:artId/approve.
async function CHEEKY_approvePortalArt(token, artId) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const order = await prisma.order.findFirst({ where: { portalToken: String(token || ""), portalEnabled: true }, select: { id: true } });
  if (!order) return { success: false, error: "Portal link not found", code: "PORTAL_NOT_FOUND" };
  const art = await prisma.artFile.findFirst({ where: { id: String(artId || ""), orderId: order.id } });
  if (!art) return { success: false, error: "Art file not found", code: "ART_NOT_FOUND" };
  const updated = await prisma.artFile.update({ where: { id: art.id }, data: { approvalStatus: "APPROVED" } });
  return { success: true, data: updated };
}

// [CHEEKY-GATE] CHEEKY_createIntakeOrder — extracted from POST / in intake.js.
// Pure relocation: order.create + lineItem.create for web intake flow.
async function CHEEKY_createIntakeOrder({ customerName, email, phone, notes, product, quantity, generatePortalToken }) {
  const prisma = getPrisma();
  if (!prisma) return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const order = await prisma.order.create({
    data: { customerName, email, phone, notes, status: "INTAKE", portalToken: generatePortalToken(), portalEnabled: true, depositPaid: false, garmentsOrdered: false, garmentsReceived: false, productionComplete: false, qcComplete: false, nextAction: "Collect deposit", nextOwner: "Cheeky", blockedReason: "WAITING_ON_DEPOSIT" },
  });
  await prisma.lineItem.create({ data: { orderId: order.id, description: product, quantity } });
  return { success: true, data: order };
}

module.exports = {
  createQuickOrder,
  computeRoutingHint,
  CHEEKY_listOrders,
  CHEEKY_listPayableOrders,
  CHEEKY_advanceOrderSmart,
  CHEEKY_sendFollowupReminder,
  CHEEKY_markFollowupDone,
  CHEEKY_listPrintQueue,
  CHEEKY_listPickupReady,
  CHEEKY_markPickupNotified,
  CHEEKY_getDailyReport,
  CHEEKY_listProductionQueueV33,
  CHEEKY_getPortalOrder,
  CHEEKY_approvePortalArt,
  CHEEKY_createIntakeOrder,
};
