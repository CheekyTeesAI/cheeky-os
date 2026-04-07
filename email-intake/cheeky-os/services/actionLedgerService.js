/**
 * Bundle 41 — centralized in-memory action ledger.
 */

const MAX_EVENTS = 200;

const ALLOWED_TYPES = new Set([
  "followup",
  "invoice",
  "production",
  "exception",
  "override",
  "autopilot",
  "runbook",
  "response",
  "pricing",
]);

const ALLOWED_STATUS = new Set([
  "success",
  "blocked",
  "skipped",
  "approved",
  "rejected",
  "info",
]);

/** @type {{ events: object[] }} */
const store = { events: [] };

function newId() {
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {number | undefined} limit
 * @param {number} fallback
 */
function toLimit(limit, fallback) {
  const n = Math.floor(Number(limit));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(100, n);
}

/**
 * @param {object} event
 */
function normalizeEvent(event) {
  const e = event && typeof event === "object" ? event : {};
  const typeRaw = String(e.type || "response").toLowerCase();
  const type = ALLOWED_TYPES.has(typeRaw) ? typeRaw : "response";
  const statusRaw = String(e.status || "info").toLowerCase();
  const status = ALLOWED_STATUS.has(statusRaw) ? statusRaw : "info";
  const meta =
    e.meta && typeof e.meta === "object" && !Array.isArray(e.meta) ? { ...e.meta } : {};
  return {
    id: String(e.id || "").trim() || newId(),
    type,
    action: String(e.action || "").trim() || "event",
    status,
    customerName: String(e.customerName != null ? e.customerName : "").trim(),
    orderId: String(e.orderId != null ? e.orderId : "").trim(),
    reason: String(e.reason != null ? e.reason : "").trim(),
    meta,
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {object} event
 * @returns {object}
 */
function addEvent(event) {
  const row = normalizeEvent(event);
  store.events.unshift(row);
  if (store.events.length > MAX_EVENTS) {
    store.events = store.events.slice(0, MAX_EVENTS);
  }
  return row;
}

/**
 * @param {number} [limit]
 * @returns {object[]}
 */
function getRecentEvents(limit) {
  try {
    return store.events.slice(0, toLimit(limit, 20));
  } catch (_) {
    return [];
  }
}

/**
 * @param {string} type
 * @param {number} [limit]
 * @returns {object[]}
 */
function getEventsByType(type, limit) {
  try {
    const t = String(type || "").trim().toLowerCase();
    return store.events
      .filter((e) => String(e.type || "").toLowerCase() === t)
      .slice(0, toLimit(limit, 20));
  } catch (_) {
    return [];
  }
}

/**
 * @param {string} orderId
 * @param {number} [limit]
 * @returns {object[]}
 */
function getEventsByOrder(orderId, limit) {
  try {
    const oid = String(orderId || "").trim();
    if (!oid) return [];
    return store.events
      .filter((e) => String(e.orderId || "").trim() === oid)
      .slice(0, toLimit(limit, 20));
  } catch (_) {
    return [];
  }
}

/**
 * Safe helper: never throws into core flows.
 * @param {object} event
 */
function recordLedgerEventSafe(event) {
  try {
    addEvent(event);
  } catch (_) {}
}

module.exports = {
  addEvent,
  getRecentEvents,
  getEventsByType,
  getEventsByOrder,
  recordLedgerEventSafe,
};
