/**
 * Square read API — normalized shapes; safe mock/degraded fallbacks.
 */
const { fetchSquareInvoices } = require("./squareDataService");
const { getSquareMode } = require("./squareConfigService");

function resolveBase() {
  const explicit = String(process.env.SQUARE_ENVIRONMENT || "").trim().toLowerCase();
  if (explicit === "sandbox") return "https://connect.squareupsandbox.com/v2";
  return "https://connect.squareup.com/v2";
}

function headers() {
  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  return {
    Authorization: `Bearer ${token}`,
    "Square-Version": "2025-05-21",
    "Content-Type": "application/json",
  };
}

function mapInvoiceStatus(inv) {
  const raw = String((inv && inv.status) || "").toUpperCase();
  const due =
    inv && inv.paymentRequests && inv.paymentRequests[0]
      ? inv.paymentRequests[0].dueDate
      : null;
  const pr = inv && inv.paymentRequests && inv.paymentRequests[0] ? inv.paymentRequests[0] : null;
  const amtDue = pr && pr.computedAmountMoney ? Number(pr.computedAmountMoney.amount || 0) / 100 : 0;
  const amtPaid =
    pr && pr.totalCompletedAmountMoney ? Number(pr.totalCompletedAmountMoney.amount || 0) / 100 : 0;
  const custId =
    inv && inv.primaryRecipient && inv.primaryRecipient.customerId
      ? inv.primaryRecipient.customerId
      : null;
  let name = "Square Customer";
  if (inv && inv.primaryRecipient) {
    const g = inv.primaryRecipient.givenName || "";
    const f = inv.primaryRecipient.familyName || "";
    const n = `${g} ${f}`.trim();
    if (n) name = n;
    else if (custId) name = `Customer ${String(custId).slice(0, 8)}`;
  }
  return {
    squareInvoiceId: inv && inv.id ? inv.id : null,
    customerId: custId,
    customerName: name,
    amountDue: amtDue,
    amountPaid: amtPaid,
    status: raw || "UNKNOWN",
    dueDate: due || null,
    createdAt: (inv && inv.createdAt) || null,
    updatedAt: (inv && inv.updatedAt) || null,
    orderId: (inv && inv.orderId) || (inv && inv.order_id) || null,
    estimateLike: raw === "DRAFT" || raw === "SCHEDULED",
  };
}

async function getSquareInvoices() {
  const r = await fetchSquareInvoices();
  const raw = Array.isArray(r && r.invoices) ? r.invoices : [];
  const mode = getSquareMode();
  const normalized = raw.map((inv) => {
    if (inv && inv.id && inv.amount !== undefined) {
      return {
        squareInvoiceId: inv.id,
        customerId: null,
        customerName: inv.customer || "Unknown",
        amountDue: Number(inv.amount) || 0,
        amountPaid: inv.status === "PAID" ? Number(inv.amount) || 0 : 0,
        status: String(inv.status || "UNPAID").toUpperCase(),
        dueDate: inv.dueDate || null,
        createdAt: inv.createdAt || null,
        updatedAt: inv.createdAt || null,
        orderId: null,
        estimateLike: false,
      };
    }
    return mapInvoiceStatus(inv);
  });
  return {
    invoices: normalized,
    mock: Boolean(r && r.mock),
    reason: r && r.reason ? r.reason : null,
    mode: mode.mode,
  };
}

async function getSquareEstimates() {
  const { invoices, mock, reason, mode } = await getSquareInvoices();
  const open = invoices.filter((i) => i.estimateLike || /DRAFT|UNPAID|SCHEDULED/i.test(String(i.status)));
  return { estimates: open, mock, reason, mode };
}

async function squareGet(path) {
  const token = String(process.env.SQUARE_ACCESS_TOKEN || "").trim();
  if (!token) {
    return { ok: false, status: 0, body: null, degraded: true };
  }
  try {
    const res = await fetch(`${resolveBase()}${path}`, { method: "GET", headers: headers() });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (_e) {
      json = null;
    }
    return { ok: res.ok, status: res.status, body: json, degraded: !res.ok };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e && e.message ? e.message : "fetch_failed", degraded: true };
  }
}

async function getSquareCustomers() {
  const mode = getSquareMode();
  if (mode.mode !== "LIVE") {
    return {
      customers: [],
      mock: true,
      reason: "square_not_configured",
      mode: mode.mode,
    };
  }
  const r = await squareGet("/customers?limit=100");
  if (!r.ok || !r.body) {
    return { customers: [], mock: true, reason: r.error || `http_${r.status}`, mode: "DEGRADED" };
  }
  const raw = Array.isArray(r.body.customers) ? r.body.customers : [];
  const customers = raw.map((c) => ({
    squareCustomerId: c.id,
    givenName: c.givenName || "",
    familyName: c.familyName || "",
    email: (c.emailAddress && c.emailAddress.emailAddress) || null,
    phone: (c.phoneNumber && c.phoneNumber.phoneNumber) || null,
    createdAt: c.createdAt || null,
    updatedAt: c.updatedAt || null,
  }));
  return { customers, mock: false, reason: null, mode: "LIVE" };
}

async function getSquarePayments() {
  const mode = getSquareMode();
  if (mode.mode !== "LIVE") {
    return { payments: [], mock: true, reason: "square_not_configured", mode: mode.mode };
  }
  const r = await squareGet("/payments?limit=100&sort_order=DESC");
  if (!r.ok || !r.body) {
    return { payments: [], mock: true, reason: r.error || `http_${r.status}`, mode: "DEGRADED" };
  }
  const raw = Array.isArray(r.body.payments) ? r.body.payments : [];
  const payments = raw.map((p) => ({
    squarePaymentId: p.id,
    customerId: p.customerId || null,
    amount: p.amountMoney ? Number(p.amountMoney.amount || 0) / 100 : 0,
    status: String(p.status || "UNKNOWN").toUpperCase(),
    createdAt: p.createdAt || null,
    orderId: p.orderId || null,
    invoiceId: p.invoiceId || null,
  }));
  return { payments, mock: false, reason: null, mode: "LIVE" };
}

async function getSquareInvoiceById(id) {
  const mode = getSquareMode();
  if (!id || mode.mode !== "LIVE") {
    return { invoice: null, mock: true, reason: "unavailable" };
  }
  const r = await squareGet(`/invoices/${encodeURIComponent(String(id))}`);
  if (!r.ok || !r.body || !r.body.invoice) {
    return { invoice: null, mock: true, reason: r.error || `http_${r.status}` };
  }
  return { invoice: mapInvoiceStatus(r.body.invoice), mock: false, reason: null };
}

async function getSquareCustomerById(id) {
  const mode = getSquareMode();
  if (!id || mode.mode !== "LIVE") {
    return { customer: null, mock: true, reason: "unavailable" };
  }
  const r = await squareGet(`/customers/${encodeURIComponent(String(id))}`);
  if (!r.ok || !r.body || !r.body.customer) {
    return { customer: null, mock: true, reason: r.error || `http_${r.status}` };
  }
  const c = r.body.customer;
  return {
    customer: {
      squareCustomerId: c.id,
      givenName: c.givenName || "",
      familyName: c.familyName || "",
      email: (c.emailAddress && c.emailAddress.emailAddress) || null,
      phone: (c.phoneNumber && c.phoneNumber.phoneNumber) || null,
    },
    mock: false,
    reason: null,
  };
}

module.exports = {
  getSquareInvoices,
  getSquareEstimates,
  getSquareCustomers,
  getSquarePayments,
  getSquareInvoiceById,
  getSquareCustomerById,
  mapInvoiceStatus,
};
