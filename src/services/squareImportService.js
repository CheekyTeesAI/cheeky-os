"use strict";

const { getPrisma, runDecisionEngineInTransaction } = require("./decisionEngine");
const { computeRoutingHint } = require("./routingService");

const { OrderDepositStatus } = require("@prisma/client");

function moneyToNumber(m) {
  if (m == null) return 0;
  if (typeof m === "number" && Number.isFinite(m)) return m / 100;
  if (typeof m !== "object") return 0;
  const raw = m.amount != null ? m.amount : 0;
  if (typeof raw === "bigint") return Number(raw) / 100;
  if (typeof raw === "number") return raw / 100;
  const n = Number(raw);
  return Number.isFinite(n) ? n / 100 : 0;
}

function squareOrderLooksPaid(sqOrder) {
  const st = String(sqOrder.state || sqOrder.order_state || "").toUpperCase();
  if (st === "COMPLETED" || st === "CLOSED") return true;
  const due = sqOrder.net_amount_due_money;
  if (due && moneyToNumber(due) <= 0.0001) return true;
  return false;
}

function buildImportEmail(squareOrderId) {
  const safe = String(squareOrderId || "unknown")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48);
  return `sq-${safe || "order"}@square-import.cheeky.local`;
}

function extractNotes(sqOrder) {
  const bits = [];
  if (sqOrder.note) bits.push(String(sqOrder.note));
  if (sqOrder.metadata && typeof sqOrder.metadata === "object") {
    try {
      bits.push(JSON.stringify(sqOrder.metadata));
    } catch (_) {
      /* ignore */
    }
  }
  return bits.join("\n").slice(0, 8000);
}

/**
 * Map one Square API order object → Customer + Order + LineItems + decision engine (single transaction).
 * Order of truth: Cheeky DB; Square is ingest only.
 */
async function persistSquareOrder(sqOrder) {
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  const extId = String(sqOrder.id || "").trim();
  if (!extId) {
    return { success: false, error: "Square order missing id", code: "INVALID_SQUARE_ORDER" };
  }

  try {
    const existing = await prisma.order.findFirst({
      where: {
        OR: [{ squareId: extId }, { squareOrderId: extId }],
      },
    });
    if (existing) {
      console.log("[squareImport] skip existing squareId=", extId, "orderId=", existing.id);
      return { success: true, data: { skipped: true, orderId: existing.id } };
    }

    const paid = squareOrderLooksPaid(sqOrder);
    const lineItemsIn = Array.isArray(sqOrder.line_items) ? sqOrder.line_items : [];
    const first = lineItemsIn[0] || {};
    const description =
      String(first.name || first.note || first.title || "Square line item").trim() || "Square import";
    let qty = 0;
    for (const li of lineItemsIn) {
      const q = Number(li.quantity || 0);
      qty += Number.isFinite(q) && q > 0 ? q : 1;
    }
    if (qty < 1) qty = 1;
    const route = computeRoutingHint({ description, qty });
    let totalDollars = moneyToNumber(sqOrder.total_money);
    if (totalDollars <= 0 && lineItemsIn.length) {
      totalDollars = lineItemsIn.reduce(
        (acc, li) => acc + moneyToNumber(li.total_money || li.gross_sales_money || li.base_price_money),
        0
      );
    }

    const email = buildImportEmail(extId);
    const customerName =
      String(sqOrder.customer_name || sqOrder.customer_id || "Square customer").slice(0, 200) || "Square customer";
    const phone =
      sqOrder.fulfillments && sqOrder.fulfillments[0] && sqOrder.fulfillments[0].pickup_details
        ? String(sqOrder.fulfillments[0].pickup_details.recipient_phone_number || "").trim() || null
        : null;

    const notes = extractNotes(sqOrder);

    const result = await prisma.$transaction(async (tx) => {
      let customer = await tx.customer.findUnique({ where: { email } });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: customerName,
            email,
            phone,
          },
        });
      }

      const liCreates = [];
      if (lineItemsIn.length === 0) {
        liCreates.push({
          description,
          quantity: qty,
          unitPrice: totalDollars > 0 ? totalDollars / qty : 0,
          productionType: route.productionType,
        });
      } else {
        for (const li of lineItemsIn) {
          const q = Math.max(1, parseInt(String(li.quantity || "1"), 10) || 1);
          const lineTotal = moneyToNumber(li.total_money || li.gross_sales_money || li.base_price_money);
          liCreates.push({
            description: String(li.name || description).slice(0, 500),
            quantity: q,
            unitPrice: lineTotal > 0 ? lineTotal / q : 0,
            productionType: route.productionType,
          });
        }
      }

      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          customerName,
          email,
          phone: phone || undefined,
          quantity: qty,
          notes,
          printMethod: route.productionType,
          source: "square_import",
          squareId: extId,
          squareOrderId: extId,
          totalAmount: totalDollars,
          quotedAmount: totalDollars,
          amountPaid: paid ? totalDollars : 0,
          depositPaid: paid,
          depositReceived: paid,
          depositStatus: paid ? OrderDepositStatus.PAID : OrderDepositStatus.NONE,
          lineItems: { create: liCreates },
        },
        include: { lineItems: true },
      });

      await tx.productionRoute.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          routeStatus: "ROUTED",
          productionType: route.productionType,
          assignee: "Jeremy",
          rationale: route.rationale,
        },
        update: {
          routeStatus: "ROUTED",
          productionType: route.productionType,
          assignee: "Jeremy",
          rationale: route.rationale,
        },
      });

      const finalOrder = await runDecisionEngineInTransaction(tx, order.id);
      return { order: finalOrder };
    });

    console.log("[squareImport] imported squareId=", extId, "orderId=", result.order.id);
    return { success: true, data: { skipped: false, ...result } };
  } catch (e) {
    console.error("[squareImportService.persistSquareOrder]", e && e.stack ? e.stack : e);
    return {
      success: false,
      error: e && e.message ? e.message : "import_failed",
      code: "IMPORT_FAILED",
    };
  }
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

/**
 * POST https://connect.squareup.com/v2/orders/search
 */
async function searchRecentSquareOrders({ limit = 30 } = {}) {
  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const locationId = String(process.env.SQUARE_LOCATION_ID || "").trim();
  if (!token || !locationId) {
    return { success: false, error: "SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID required", code: "SQUARE_CONFIG" };
  }
  const endAt = new Date();
  const startAt = new Date(Date.now() - 7 * 86400000);
  try {
    const body = {
      location_ids: [locationId],
      query: {
        filter: {
          date_time_filter: {
            created_at: {
              start_at: startAt.toISOString(),
              end_at: endAt.toISOString(),
            },
          },
        },
        sort: {
          sort_field: "CREATED_AT",
          sort_order: "DESC",
        },
      },
      limit,
    };
    const { ok, status, json } = await fetchJson("https://connect.squareup.com/v2/orders/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-10-17",
      },
      body: JSON.stringify(body),
    });
    if (!ok) {
      console.error("[squareImport] search failed status=", status, json);
      return {
        success: false,
        error: (json && json.errors && json.errors[0] && json.errors[0].detail) || "square_search_failed",
        code: "SQUARE_API_ERROR",
      };
    }
    const orders = (json && json.orders) || [];
    return { success: true, data: { orders } };
  } catch (e) {
    console.error("[squareImportService.searchRecentSquareOrders]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "search_failed", code: "SEARCH_FAILED" };
  }
}

async function retrieveSquareOrder(orderId) {
  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  if (!token) {
    return { success: false, error: "SQUARE_ACCESS_TOKEN required", code: "SQUARE_CONFIG" };
  }
  const id = encodeURIComponent(String(orderId || "").trim());
  if (!id) {
    return { success: false, error: "order id required", code: "VALIDATION_ERROR" };
  }
  try {
    const { ok, status, json } = await fetchJson(`https://connect.squareup.com/v2/orders/${id}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-10-17",
      },
    });
    if (!ok) {
      return {
        success: false,
        error: (json && json.errors && json.errors[0] && json.errors[0].detail) || "retrieve_failed",
        code: "SQUARE_API_ERROR",
        status,
      };
    }
    const order = json && json.order;
    if (!order) {
      return { success: false, error: "empty order", code: "EMPTY_ORDER" };
    }
    return { success: true, data: { order } };
  } catch (e) {
    console.error("[squareImportService.retrieveSquareOrder]", e && e.stack ? e.stack : e);
    return { success: false, error: e && e.message ? e.message : "retrieve_failed", code: "RETRIEVE_FAILED" };
  }
}

async function importRecentOrders(opts) {
  const searched = await searchRecentSquareOrders(opts);
  if (!searched.success) {
    return searched;
  }
  const orders = searched.data.orders || [];
  const results = [];
  for (const o of orders) {
    const r = await persistSquareOrder(o);
    results.push({ squareId: o.id, result: r });
  }
  return { success: true, data: { count: orders.length, results } };
}

async function importOrderBySquareId(squareOrderId) {
  const retrieved = await retrieveSquareOrder(squareOrderId);
  if (!retrieved.success) {
    return retrieved;
  }
  return persistSquareOrder(retrieved.data.order);
}

module.exports = {
  persistSquareOrder,
  searchRecentSquareOrders,
  retrieveSquareOrder,
  importRecentOrders,
  importOrderBySquareId,
  squareOrderLooksPaid,
};
