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

/** Max 15 enriched rows total (8 + 7). */
const MAX_UNPAID_ROWS = 8;
const MAX_STALE_ROWS = 7;
const MAX_CUSTOMER_IDS = 15;

function extractPrimaryEmail(primary) {
  if (!primary || !primary.email_address) return "";
  const e = primary.email_address;
  if (typeof e === "string") return e.trim();
  if (e && typeof e.email_address === "string") return e.email_address.trim();
  return "";
}

function extractCustomerEmail(c) {
  if (!c || !c.email_address) return "";
  const e = c.email_address;
  if (typeof e === "string") return e.trim();
  if (e && typeof e.email_address === "string") return e.email_address.trim();
  return "";
}

/**
 * One Square HTTP call; caps IDs to MAX_CUSTOMER_IDS.
 * @returns {Promise<Map<string, { displayName: string, phone: string, email: string }>>}
 */
async function batchRetrieveCustomersMap(baseUrl, headers, customerIds) {
  const unique = [...new Set(customerIds.filter((id) => id && String(id).trim()))].slice(
    0,
    MAX_CUSTOMER_IDS
  );
  const map = new Map();
  if (unique.length === 0) return map;

  try {
    const res = await fetch(baseUrl + "/customers/batch-retrieve", {
      method: "POST",
      headers,
      body: JSON.stringify({ customer_ids: unique }),
    });
    if (!res.ok) return map;
    const data = await res.json();
    const list = Array.isArray(data.customers) ? data.customers : [];
    for (const c of list) {
      if (!c || !c.id) continue;
      const name = [c.given_name, c.family_name].filter(Boolean).join(" ").trim();
      map.set(c.id, {
        displayName: name || "Unknown Customer",
        phone: c.phone_number ? String(c.phone_number) : "",
        email: extractCustomerEmail(c),
      });
    }
  } catch (err) {
    console.error("[revenueFollowups] batch-retrieve customers:", err.message || err);
  }
  return map;
}

function applyCustomerLookup(customerId, fallbackName, invoiceEmail, customerMap) {
  const cid = customerId ? String(customerId).trim() : "";
  const invMail = invoiceEmail ? String(invoiceEmail).trim() : "";
  if (!cid) {
    return {
      customerName: fallbackName || "Unknown Customer",
      phone: "",
      email: invMail || "",
    };
  }
  const info = customerMap.get(cid);
  if (!info) {
    return {
      customerName: "Unknown Customer",
      phone: "",
      email: invMail || "",
    };
  }
  return {
    customerName: info.displayName || "Unknown Customer",
    phone: info.phone || "",
    email: (info.email && String(info.email)) || invMail || "",
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
        const customerId =
          (primary.customer_id && String(primary.customer_id)) ||
          (inv.customer_id && String(inv.customer_id)) ||
          "";
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
          customerId,
          customerName,
          invoiceEmail: extractPrimaryEmail(primary),
          amount: centsToAmount(amountMoney.amount),
          dueDate: due ? String(due) : "",
          daysPastDue: daysBetweenPast(due || inv.updated_at || inv.created_at),
          createdAt: inv.created_at ? String(inv.created_at) : "",
        });
      }
      unpaidInvoices.sort(
        (a, b) => (b.daysPastDue || 0) - (a.daysPastDue || 0)
      );
      unpaidInvoices.splice(MAX_UNPAID_ROWS);
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
          customerId: order.customer_id ? String(order.customer_id) : "",
          customerName,
          invoiceEmail: "",
          amount,
          createdAt: created ? String(created) : "",
          daysOld: daysBetweenPast(created),
        });
      }
      staleEstimates.splice(MAX_STALE_ROWS);
    } else {
      const t = await ordRes.text();
      console.error("[revenueFollowups] orders search failed:", ordRes.status, t.slice(0, 200));
    }
  } catch (err) {
    console.error("[revenueFollowups] orders search error:", err.message || err);
  }

  const idList = [
    ...unpaidInvoices.map((r) => r.customerId),
    ...staleEstimates.map((r) => r.customerId),
  ];
  const customerMap = await batchRetrieveCustomersMap(baseUrl, headers, idList);

  const unpaidOut = unpaidInvoices.map((r) => {
    const { customerId, customerName: fb, invoiceEmail, ...rest } = r;
    const { customerName, phone, email } = applyCustomerLookup(
      customerId,
      fb,
      invoiceEmail,
      customerMap
    );
    return {
      id: rest.id || "",
      customerId: customerId || "",
      customerName,
      phone,
      email,
      amount: rest.amount || "",
      dueDate: rest.dueDate || "",
      daysPastDue: Number(rest.daysPastDue) || 0,
    };
  });

  const staleOut = staleEstimates.map((r) => {
    const { customerId, customerName: fb, invoiceEmail, ...rest } = r;
    const { customerName, phone, email } = applyCustomerLookup(
      customerId,
      fb,
      invoiceEmail,
      customerMap
    );
    return {
      id: rest.id || "",
      customerId: customerId || "",
      customerName,
      phone,
      email,
      amount: rest.amount || "",
      createdAt: rest.createdAt || "",
      daysOld: Number(rest.daysOld) || 0,
    };
  });

  return { unpaidInvoices: unpaidOut, staleEstimates: staleOut };
}

module.exports = { getRevenueFollowups };
