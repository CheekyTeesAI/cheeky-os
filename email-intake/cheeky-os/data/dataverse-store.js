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

/** Multi-environment: CHEEKY_DATAVERSE_PROFILE=staging → DATAVERSE_URL_STAGING overrides DATAVERSE_URL. */
function dvProfileSuffix() {
  const p = String(process.env.CHEEKY_DATAVERSE_PROFILE || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return p ? "_" + p.toUpperCase().replace(/-/g, "_") : "";
}

function envWithProfile(base) {
  const suf = dvProfileSuffix();
  if (!suf) return String(process.env[base] || "");
  const named = process.env[`${base}${suf}`];
  const fallback = process.env[base];
  const v =
    named != null && String(named).trim() !== "" ? named : fallback != null ? fallback : "";
  return String(v || "");
}

function effectiveDataverseSummary() {
  const raw = String(process.env.CHEEKY_DATAVERSE_PROFILE || "").trim();
  const label = raw || "default";
  return {
    profile: label,
    suffix: dvProfileSuffix().replace(/^_/, "") || null,
    urlConfigured: !!String(envWithProfile("DATAVERSE_URL")).trim(),
  };
}

const DATAVERSE_URL = () => envWithProfile("DATAVERSE_URL") || "";
const CLIENT_ID = () => envWithProfile("DATAVERSE_CLIENT_ID") || "";
const CLIENT_SECRET = () => envWithProfile("DATAVERSE_CLIENT_SECRET") || "";
const TENANT_ID = () => envWithProfile("DATAVERSE_TENANT_ID") || "";

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

/** Force new token fetch (401 recovery). */
function invalidateAccessToken() {
  _cachedToken = null;
  _tokenExpiry = 0;
}

async function getToken() {
  if (_cachedToken && Date.now() < _tokenExpiry) return _cachedToken;

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID()}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID(),
    client_secret: CLIENT_SECRET(),
    scope: `${DATAVERSE_URL()}/.default`,
  });

  const { fetchSafeTransientRetry } = require("../services/cheekyOsHttpRetry.service");
  const result = await fetchSafeTransientRetry(
    tokenUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      timeoutMs: 25000,
    },
    { label: "dataverse-token" }
  );

  if (!result.ok || !result.data?.access_token) {
    logger.error("[DATAVERSE] Token fetch failed: " + (result.error || "No access_token"));
    return null;
  }

  _cachedToken = result.data.access_token;
  let skew = parseInt(String(process.env.CHEEKY_DV_TOKEN_SKEW_MS || "120000"), 10);
  if (!Number.isFinite(skew)) skew = 120000;
  skew = Math.max(60000, Math.min(skew, 540000));

  _tokenExpiry =
    Date.now() + (result.data.expires_in || 3600) * 1000 - skew;
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

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/** True when a retry might succeed (avoid retrying OData 400/401). */
function isTransientODataFailure(result) {
  if (!result || result.ok) return false;
  const err = String(result.error || "");
  if (/HTTP (429|502|503|504)\b/i.test(err)) return true;
  if (/timed out|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(err)) {
    return true;
  }
  return false;
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

/**
 * Arbitrary OData path under /api/data/v9.2/ (e.g. "ct_intake_queues?$filter=...").
 * Used by CHEEKY OS v1.0 ctSync (intake gate + audit).
 */
async function odataRequest(method, pathAfterVersion, body, extraHeaders, fetchOptions) {
  if (!isConfigured()) return notConfigured();

  const rel = String(pathAfterVersion || "").replace(/^\//, "");
  const url = `${DATAVERSE_URL()}/api/data/v9.2/${rel}`;
  const opts = { method: method || "GET", headers: {} };
  if (body != null && method !== "GET" && method !== "HEAD") {
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const tm = fetchOptions && fetchOptions.timeoutMs != null ? Number(fetchOptions.timeoutMs) : null;
  if (tm != null && !Number.isNaN(tm) && tm > 0) opts.timeoutMs = tm;

  let maxAttempts = parseInt(String(process.env.CHEEKY_DV_ODATA_RETRY_ATTEMPTS || "3"), 10);
  if (!Number.isFinite(maxAttempts) || maxAttempts < 1) maxAttempts = 3;
  if (maxAttempts > 8) maxAttempts = 8;
  let last = { ok: false, data: null, error: "no_attempt" };
  const baseBackoff = Number(process.env.CHEEKY_DV_ODATA_RETRY_BACKOFF_MS || 380);
  const bump = Number.isFinite(baseBackoff) && baseBackoff > 0 ? baseBackoff : 380;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const token = await getToken();
    if (!token) {
      last = { ok: false, data: null, error: "Token unavailable" };
      break;
    }
    opts.headers = { ...getHeaders(token), ...(extraHeaders || {}) };

    last = await fetchSafe(url, opts);
    const errStr = String(last.error || "");

    const can401 =
      String(process.env.CHEEKY_DV_RETRY_AFTER_401 || "true").toLowerCase() !== "false";
    if (
      !last.ok &&
      can401 &&
      /HTTP\s401\b/i.test(errStr)
    ) {
      invalidateAccessToken();
      logger.warn("[DATAVERSE] OData 401 — refreshing token once path=" + rel.slice(0, 220));
      const token2 = await getToken();
      if (token2) {
        opts.headers = { ...getHeaders(token2), ...(extraHeaders || {}) };
        last = await fetchSafe(url, opts);
      }
    }

    if (last.ok) return last;
    if (!isTransientODataFailure(last) || attempt >= maxAttempts) {
      try {
        const preview =
          last.data != null && typeof last.data === "object"
            ? JSON.stringify(last.data).slice(0, 2200)
            : String(last.data || "").slice(0, 500);
        logger.warn(
          "[DATAVERSE] OData " +
            (method || "GET") +
            " failed after " +
            attempt +
            "/" +
            maxAttempts +
            " path=api/data/v9.2/" +
            rel.slice(0, 450) +
            " error=" +
            String(last.error || "").slice(0, 700) +
            (preview ? " responseJson=" + preview : "")
        );
      } catch (_) {
        /* ignore logging errors */
      }
      try {
        require("../services/cheekyOsRuntimeObservability.service").recordODataFailureLogged();
      } catch (_) {}
      return last;
    }
    logger.warn(
      "[DATAVERSE] OData transient failure attempt " +
        attempt +
        "/" +
        maxAttempts +
        " path=" +
        rel.slice(0, 220) +
        " backing off: " +
        String(last.error || "").slice(0, 260)
    );
    await sleep(bump * attempt);
  }
  return last;
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
  invalidateAccessToken,
  effectiveDataverseSummary,
  TABLES,
  FIELD_MAP,
  odataRequest,
  saveCustomer,
  saveDeal,
  getOpenDeals,
  findDealByInvoiceId,
  updateDeal,
  savePayment,
  saveEvent,
};
