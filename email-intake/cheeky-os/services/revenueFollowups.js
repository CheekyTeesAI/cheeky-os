/**
 * Bundle 1 — read-only Square: unpaid / partial invoices + stale open orders (estimate proxy).
 * No mutations.
 */

const {
  initializeSquareIntegration,
  getSquareIntegrationStatus,
  getSquareRuntimeConfig,
  getBaseUrl,
} = require("../integrations/square");

function centsToAmount(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return "";
  return (Number(cents) / 100).toFixed(2);
}

function daysBetweenPast(isoDate) {
  if (!isoDate) return 0;
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

async function getAuthHeaders() {
  await initializeSquareIntegration();
  const cfg = getSquareRuntimeConfig();
  const token = cfg && cfg.token;
  if (!token) return null;
  return {
    Authorization: "Bearer " + token,
    "Square-Version": "2025-05-21",
    "Content-Type": "application/json",
  };
}

/**
 * @returns {Promise<{ unpaidInvoices: object[], staleEstimates: object[] }>}
 */
async function getRevenueFollowups() {
  const empty = { unpaidInvoices: [], staleEstimates: [] };
  const headers = await getAuthHeaders();
  if (!headers) {
    return empty;
  }

  const status = getSquareIntegrationStatus();
  const locationId = status.location && status.location.id;
  if (!locationId) {
    console.error("[revenueFollowups] No Square location — returning empty lists.");
    return empty;
  }

  const baseUrl = getBaseUrl();
  const unpaidInvoices = [];
  const staleEstimates = [];

  try {
    const invBody = {
      query: {
        filter: {
          location_ids: [locationId],
          invoice_states: ["UNPAID", "PARTIALLY_PAID"],
        },
      },
      limit: 100,
    };
    const invRes = await fetch(baseUrl + "/invoices/search", {
      method: "POST",
      headers,
      body: JSON.stringify(invBody),
    });
    if (invRes.ok) {
      const invData = await invRes.json();
      const invoices = Array.isArray(invData.invoices) ? invData.invoices : [];
      for (const inv of invoices) {
        const due =
          (inv.payment_requests &&
            inv.payment_requests[0] &&
            inv.payment_requests[0].due_date) ||
          inv.scheduled_at ||
          "";
        const primary = inv.primary_recipient || {};
        const customerName =
          [primary.given_name, primary.family_name].filter(Boolean).join(" ").trim() ||
          "Customer";
        const amountMoney =
          (inv.invoice_payment_requests &&
            inv.invoice_payment_requests[0] &&
            inv.invoice_payment_requests[0].computed_amount_money) ||
          inv.total_money ||
          inv.amount_money ||
          {};
        unpaidInvoices.push({
          id: inv.id || "",
          customerName,
          amount: centsToAmount(amountMoney.amount),
          dueDate: due ? String(due) : "",
          daysPastDue: daysBetweenPast(due || inv.updated_at || inv.created_at),
        });
      }
      unpaidInvoices.sort(
        (a, b) => (b.daysPastDue || 0) - (a.daysPastDue || 0)
      );
    } else {
      const t = await invRes.text();
      console.error("[revenueFollowups] invoice search failed:", invRes.status, t.slice(0, 200));
    }
  } catch (err) {
    console.error("[revenueFollowups] invoice search error:", err.message || err);
  }

  const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;

  try {
    const ordBody = {
      location_ids: [locationId],
      query: {
        filter: {
          state_filter: {
            states: ["OPEN"],
          },
        },
        sort: {
          sort_field: "CREATED_AT",
          sort_order: "ASC",
        },
      },
      limit: 100,
    };
    const ordRes = await fetch(baseUrl + "/orders/search", {
      method: "POST",
      headers,
      body: JSON.stringify(ordBody),
    });
    if (ordRes.ok) {
      const ordData = await ordRes.json();
      const orders = Array.isArray(ordData.orders) ? ordData.orders : [];
      for (const order of orders) {
        const created = order.created_at;
        const createdMs = created ? new Date(created).getTime() : 0;
        if (!Number.isFinite(createdMs) || createdMs > fiveDaysAgo) continue;

        const li = Array.isArray(order.line_items) ? order.line_items[0] : null;
        const customerName = (li && li.name) || "Open order";
        const amount = order.total_money
          ? centsToAmount(order.total_money.amount)
          : "";
        staleEstimates.push({
          id: order.id || "",
          customerName,
          amount,
          createdAt: created ? String(created) : "",
          daysOld: daysBetweenPast(created),
        });
      }
    } else {
      const t = await ordRes.text();
      console.error("[revenueFollowups] orders search failed:", ordRes.status, t.slice(0, 200));
    }
  } catch (err) {
    console.error("[revenueFollowups] orders search error:", err.message || err);
  }

  return { unpaidInvoices, staleEstimates };
}

module.exports = { getRevenueFollowups };
