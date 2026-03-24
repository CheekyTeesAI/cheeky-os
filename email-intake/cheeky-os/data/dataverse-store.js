/**
 * Cheeky OS — Dataverse data store.
 * Syncs entities to Microsoft Dataverse via OData v4.
 * Falls back gracefully if env vars are not configured.
 *
 * @module cheeky-os/data/dataverse-store
 */

const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

// ── Configuration ───────────────────────────────────────────────────────────

const DATAVERSE_URL = () => process.env.DATAVERSE_URL || "";
const CLIENT_ID = () => process.env.DATAVERSE_CLIENT_ID || "";
const CLIENT_SECRET = () => process.env.DATAVERSE_CLIENT_SECRET || "";
const TENANT_ID = () => process.env.DATAVERSE_TENANT_ID || "";

const TABLES = {
  customers: "ct_customerses",
  deals: "ct_dealses",
  payments: "ct_paymentses",
  events: "ct_eventses",
};

const FIELD_MAP = {
  customers: {
    id: "ct_customerid",
    name: "ct_name",
    email: "ct_email",
    phone: "ct_phone",
    company: "ct_company",
    createdAt: "createdon",
    updatedAt: "modifiedon",
  },
  deals: {
    id: "ct_dealid",
    customerId: "ct_customerid",
    customerName: "ct_customername",
    customerEmail: "ct_customeremail",
    invoiceId: "ct_invoiceid",
    total: "ct_total",
    deposit: "ct_deposit",
    status: "ct_status",
    stage: "ct_stage",
    lastContactAt: "ct_lastcontactat",
    createdAt: "createdon",
    updatedAt: "modifiedon",
    notes: "ct_notes",
  },
  payments: {
    id: "ct_paymentid",
    dealId: "ct_dealid",
    invoiceId: "ct_invoiceid",
    amount: "ct_amount",
    status: "ct_status",
    paidAt: "ct_paidat",
    createdAt: "createdon",
  },
  events: {
    id: "ct_eventid",
    type: "ct_type",
    entityType: "ct_entitytype",
    entityId: "ct_entityid",
    message: "ct_message",
    value: "ct_value",
    createdAt: "createdon",
  },
};

// ── Auth ─────────────────────────────────────────────────────────────────────

function isConfigured() {
  return !!(DATAVERSE_URL() && CLIENT_ID() && CLIENT_SECRET() && TENANT_ID());
}

let _cachedToken = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID()}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID(),
    client_secret: CLIENT_SECRET(),
    scope: `${DATAVERSE_URL()}/.default`,
  });

  const result = await fetchSafe(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!result.ok || !result.data?.access_token) {
    logger.error("[DATAVERSE] Token fetch failed: " + (result.error || "No access_token"));
    return null;
  }

  _cachedToken = result.data.access_token;
  _tokenExpiry = Date.now() + (result.data.expires_in || 3600) * 1000 - 60000;
  return _cachedToken;
}

async function ensureAuth() {
  if (!isConfigured()) {
    return { ok: false, error: "Dataverse not configured - set AZURE credentials in .env" };
  }
  const token = await getToken();
  if (!token) {
    return { ok: false, error: "Dataverse auth failed - check AZURE credentials" };
  }
  return { ok: true, error: null };
}

function getHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
  };
}

function notConfigured() {
  return { ok: false, data: null, error: "dataverse_not_configured" };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapToDataverse(entity, record) {
  const map = FIELD_MAP[entity];
  if (!map) return record;
  const mapped = {};
  for (const [key, value] of Object.entries(record)) {
    if (map[key]) {
      mapped[map[key]] = value;
    }
  }
  return mapped;
}

function mapFromDataverse(entity, row) {
  const map = FIELD_MAP[entity];
  if (!map) return row;
  const reverse = {};
  for (const [appKey, dvKey] of Object.entries(map)) {
    if (row[dvKey] !== undefined) {
      reverse[appKey] = row[dvKey];
    }
  }
  return reverse;
}

async function dvPost(table, data) {
  const token = await getToken();
  if (!token) return { ok: false, data: null, error: "Token unavailable" };

  const url = `${DATAVERSE_URL()}/api/data/v9.2/${table}`;
  return fetchSafe(url, {
    method: "POST",
    headers: getHeaders(token),
    body: JSON.stringify(data),
  });
}

async function dvPatch(table, key, data) {
  const token = await getToken();
  if (!token) return { ok: false, data: null, error: "Token unavailable" };

  const url = `${DATAVERSE_URL()}/api/data/v9.2/${table}(${key})`;
  return fetchSafe(url, {
    method: "PATCH",
    headers: getHeaders(token),
    body: JSON.stringify(data),
  });
}

async function dvGet(table, filter) {
  const token = await getToken();
  if (!token) return { ok: false, data: null, error: "Token unavailable" };

  let url = `${DATAVERSE_URL()}/api/data/v9.2/${table}`;
  if (filter) url += `?$filter=${encodeURIComponent(filter)}`;

  return fetchSafe(url, { method: "GET", headers: getHeaders(token) });
}

// ── Customers ───────────────────────────────────────────────────────────────

async function saveCustomer(customer) {
  if (!isConfigured()) return notConfigured();
  try {
    const mapped = mapToDataverse("customers", customer);
    const result = await dvPost(TABLES.customers, mapped);
    return { ok: result.ok, data: customer, error: result.error };
  } catch (err) {
    logger.error(`[DATAVERSE] saveCustomer error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

// ── Deals ───────────────────────────────────────────────────────────────────

async function saveDeal(deal) {
  if (!isConfigured()) return notConfigured();
  try {
    const mapped = mapToDataverse("deals", deal);
    const result = await dvPost(TABLES.deals, mapped);
    return { ok: result.ok, data: deal, error: result.error };
  } catch (err) {
    logger.error(`[DATAVERSE] saveDeal error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

async function getOpenDeals() {
  if (!isConfigured()) return notConfigured();
  try {
    const fm = FIELD_MAP.deals;
    const filter = `${fm.status} ne 'paid' and ${fm.stage} ne 'closed'`;
    const result = await dvGet(TABLES.deals, filter);
    if (!result.ok) return result;
    const rows = result.data?.value || [];
    return { ok: true, data: rows.map((r) => mapFromDataverse("deals", r)), error: null };
  } catch (err) {
    logger.error(`[DATAVERSE] getOpenDeals error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

async function findDealByInvoiceId(invoiceId) {
  if (!isConfigured()) return notConfigured();
  try {
    const fm = FIELD_MAP.deals;
    const filter = `${fm.invoiceId} eq '${invoiceId}'`;
    const result = await dvGet(TABLES.deals, filter);
    if (!result.ok) return result;
    const rows = result.data?.value || [];
    const deal = rows.length ? mapFromDataverse("deals", rows[0]) : null;
    return { ok: true, data: deal, error: null };
  } catch (err) {
    logger.error(`[DATAVERSE] findDealByInvoiceId error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

async function updateDeal(id, updates) {
  if (!isConfigured()) return notConfigured();
  try {
    const mapped = mapToDataverse("deals", updates);
    const result = await dvPatch(TABLES.deals, id, mapped);
    return { ok: result.ok, data: updates, error: result.error };
  } catch (err) {
    logger.error(`[DATAVERSE] updateDeal error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

// ── Payments ────────────────────────────────────────────────────────────────

async function savePayment(payment) {
  if (!isConfigured()) return notConfigured();
  try {
    const mapped = mapToDataverse("payments", payment);
    const result = await dvPost(TABLES.payments, mapped);
    return { ok: result.ok, data: payment, error: result.error };
  } catch (err) {
    logger.error(`[DATAVERSE] savePayment error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

// ── Events ──────────────────────────────────────────────────────────────────

async function saveEvent(event) {
  if (!isConfigured()) return notConfigured();
  try {
    const mapped = mapToDataverse("events", event);
    const result = await dvPost(TABLES.events, mapped);
    return { ok: result.ok, data: event, error: result.error };
  } catch (err) {
    logger.error(`[DATAVERSE] saveEvent error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

module.exports = {
  isConfigured,
  ensureAuth,
  TABLES,
  FIELD_MAP,
  saveCustomer,
  saveDeal,
  getOpenDeals,
  findDealByInvoiceId,
  updateDeal,
  savePayment,
  saveEvent,
};
