/**
 * Square reporting/data engine (read-only).
 * Separate from invoice creation flow.
 */

const path = require("path");
const { fetchSafe } = require(path.join(
  __dirname,
  "..",
  "..",
  "cheeky-os",
  "utils",
  "fetchSafe"
));

const memoryService = require(path.join(__dirname, "memoryService.js"));

let squareCore = null;
function loadSquareCore() {
  if (squareCore) return squareCore;
  squareCore = require(path.join(__dirname, "..", "..", "dist", "services", "square.service.js"));
  return squareCore;
}

function getClientSafe() {
  if (!(process.env.SQUARE_ACCESS_TOKEN || "").trim()) return null;
  try {
    return loadSquareCore().getSquareClient();
  } catch {
    return null;
  }
}

function toISO(d) {
  return d instanceof Date ? d.toISOString() : String(d || "");
}

function dateRangeOrDefault(dateRange) {
  const end = dateRange && dateRange.end ? new Date(dateRange.end) : new Date();
  const start = dateRange && dateRange.start
    ? new Date(dateRange.start)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

function moneyToNumber(m) {
  const amount = Number(m && m.amount ? m.amount : 0);
  return amount / 100;
}

function mem(type, data) {
  try {
    if (typeof memoryService.logEvent === "function") {
      memoryService.logEvent(type, data);
    }
  } catch (_) {
    /* optional */
  }
}

function normPayment(p) {
  return {
    id: p.id || "",
    amount: moneyToNumber(p.amountMoney || p.amount_money),
    status: String(p.status || ""),
    customerId: p.customerId || p.customer_id || null,
    createdAt: toISO(p.createdAt || p.created_at),
  };
}

function normOrder(o) {
  const lineItems = Array.isArray(o.lineItems || o.line_items) ? (o.lineItems || o.line_items) : [];
  const total = moneyToNumber(o.totalMoney || o.total_money);
  return {
    id: o.id || "",
    total,
    lineItems: lineItems.length,
    customerId: o.customerId || o.customer_id || null,
    createdAt: toISO(o.createdAt || o.created_at),
  };
}

function normCustomer(c) {
  return {
    id: c.id || "",
    name:
      [c.givenName || c.given_name, c.familyName || c.family_name].filter(Boolean).join(" ").trim() ||
      c.companyName ||
      c.company_name ||
      "",
    email: c.emailAddress || (c.email_address && c.email_address.email_address) || "",
    phone: c.phoneNumber || c.phone_number || "",
  };
}

function normInvoice(i) {
  const reqs = Array.isArray(i.paymentRequests || i.payment_requests) ? (i.paymentRequests || i.payment_requests) : [];
  const total = reqs.reduce((sum, r) => {
    return sum + moneyToNumber(r.totalCompletedAmountMoney || r.total_completed_amount_money || r.computedAmountMoney || r.computed_amount_money);
  }, 0);
  return {
    id: i.id || "",
    status: String(i.status || "").toUpperCase(),
    customerId:
      (i.primaryRecipient && i.primaryRecipient.customerId) ||
      (i.primary_recipient && i.primary_recipient.customer_id) ||
      null,
    amount: total,
    createdAt: toISO(i.createdAt || i.created_at),
  };
}

async function getPayments(dateRange) {
  const client = getClientSafe();
  if (!client) return [];
  const { resolveSquareLocationId } = loadSquareCore();
  const { start, end } = dateRangeOrDefault(dateRange);
  try {
    const locationId = await resolveSquareLocationId(client);
    let cursor = undefined;
    const out = [];
    for (let i = 0; i < 20; i++) {
      const req = {
        beginTime: start.toISOString(),
        endTime: end.toISOString(),
        locationId,
        limit: BigInt(100),
      };
      if (cursor) req.cursor = cursor;
      const res = await client.paymentsApi.listPayments(req);
      const rows = res.result?.payments || [];
      out.push(...rows.map(normPayment));
      cursor = res.result?.cursor;
      if (!cursor) break;
    }
    return out;
  } catch (err) {
    mem("square_error", { step: "reports_getPayments", message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function getOrders(dateRange) {
  const client = getClientSafe();
  if (!client) return [];
  const { resolveSquareLocationId } = loadSquareCore();
  const { start, end } = dateRangeOrDefault(dateRange);
  try {
    const locationId = await resolveSquareLocationId(client);
    const res = await client.ordersApi.searchOrders({
      locationIds: [locationId],
      limit: BigInt(200),
      query: {
        filter: {
          dateTimeFilter: {
            createdAt: {
              startAt: start.toISOString(),
              endAt: end.toISOString(),
            },
          },
        },
        sort: { sortField: "CREATED_AT", sortOrder: "DESC" },
      },
    });
    const rows = res.result?.orders || [];
    return rows.map(normOrder);
  } catch (err) {
    mem("square_error", { step: "reports_getOrders", message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function getCustomers() {
  const client = getClientSafe();
  if (!client) return [];
  try {
    let cursor = undefined;
    const out = [];
    for (let i = 0; i < 20; i++) {
      const req = {
        query: { sort: { field: "CREATED_AT", order: "DESC" } },
        limit: BigInt(100),
      };
      if (cursor) req.cursor = cursor;
      const res = await client.customersApi.searchCustomers(req);
      const rows = res.result?.customers || [];
      out.push(...rows.map(normCustomer));
      cursor = res.result?.cursor;
      if (!cursor) break;
    }
    return out;
  } catch (err) {
    mem("square_error", { step: "reports_getCustomers", message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function getInvoices() {
  const client = getClientSafe();
  if (!client) return [];
  const { resolveSquareLocationId } = loadSquareCore();
  try {
    const locationId = await resolveSquareLocationId(client);
    const res = await client.invoicesApi.searchInvoices({
      query: {
        filter: { locationIds: [locationId] },
        sort: { field: "INVOICE_SORT_DATE", order: "DESC" },
      },
      limit: BigInt(200),
    });
    return (res.result?.invoices || []).map(normInvoice);
  } catch (err) {
    mem("square_error", { step: "reports_getInvoices", message: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function getDailySales() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  const orders = await getOrders({ start, end });
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const totalOrders = orders.length;
  const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0;
  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalOrders,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
  };
}

async function getWeeklySales() {
  const end = new Date();
  const start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  const orders = await getOrders({ start, end });
  const byDay = new Map();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    byDay.set(d, 0);
  }
  for (const o of orders) {
    const day = String(o.createdAt || "").slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, 0);
    byDay.set(day, byDay.get(day) + (Number(o.total) || 0));
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));
}

async function getTopCustomers() {
  const orders = await getOrders({ start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), end: new Date() });
  const customers = await getCustomers();
  const names = new Map(customers.map((c) => [c.id, c.name || c.email || c.id]));
  const totals = new Map();
  for (const o of orders) {
    const key = o.customerId || "UNKNOWN";
    totals.set(key, (totals.get(key) || 0) + (Number(o.total) || 0));
  }
  return Array.from(totals.entries())
    .map(([customerId, totalSpend]) => ({
      customerId,
      customer: names.get(customerId) || customerId,
      totalSpend: Math.round(totalSpend * 100) / 100,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10);
}

async function getOutstandingInvoices() {
  const invoices = await getInvoices();
  const unpaid = invoices.filter((i) => !["PAID", "CANCELED", "DRAFT"].includes(i.status));
  const totalOutstandingAmount = unpaid.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  return {
    unpaidInvoices: unpaid,
    totalOutstandingAmount: Math.round(totalOutstandingAmount * 100) / 100,
  };
}

async function getAiSummary() {
  const [daily, weekly, topCustomers, outstanding] = await Promise.all([
    getDailySales(),
    getWeeklySales(),
    getTopCustomers(),
    getOutstandingInvoices(),
  ]);
  const data = { daily, weekly, topCustomers, outstanding };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      data,
      insights: "[Insights unavailable: OPENAI_API_KEY not set]",
    };
  }

  const prompt = `You are a business analyst. Analyze this data and provide:\n- key insights\n- problems\n- opportunities\n\nData:\n${JSON.stringify(data, null, 2)}`;
  const ai = await fetchSafe("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a concise business analyst." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 700,
    }),
  });

  if (!ai.ok) {
    mem("square_error", { step: "reports_ai_summary", message: ai.error });
    return {
      data,
      insights: `[AI summary unavailable: ${ai.error || "request failed"}]`,
    };
  }

  const insights =
    ai.data &&
    ai.data.choices &&
    ai.data.choices[0] &&
    ai.data.choices[0].message
      ? String(ai.data.choices[0].message.content || "").trim()
      : "";
  return { data, insights: insights || "[AI summary empty]" };
}

module.exports = {
  getPayments,
  getOrders,
  getCustomers,
  getInvoices,
  getDailySales,
  getWeeklySales,
  getTopCustomers,
  getOutstandingInvoices,
  getAiSummary,
};
