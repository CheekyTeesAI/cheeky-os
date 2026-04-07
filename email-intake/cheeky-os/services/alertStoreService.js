/**
 * Bundle 21 — in-memory persistent alerts (no DB).
 */

/** @type {{ alerts: object[] }} */
const store = {
  alerts: [],
};

const MAX_ALERTS = 50;

const ALLOWED_TYPES = new Set([
  "followup",
  "payment",
  "production",
  "risk",
]);

const ALLOWED_SEVERITY = new Set([
  "low",
  "medium",
  "high",
  "critical",
]);

/**
 * @returns {string}
 */
function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return (
    "al_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * @param {unknown} t
 */
function normalizeType(t) {
  const x = String(t || "")
    .trim()
    .toLowerCase();
  return ALLOWED_TYPES.has(x) ? x : "";
}

/**
 * @param {unknown} s
 */
function normalizeSeverity(s) {
  const x = String(s || "")
    .trim()
    .toLowerCase();
  return ALLOWED_SEVERITY.has(x) ? x : "medium";
}

/**
 * Bundle 23 — label severity from alert kind (payment → critical, follow-up/risk → high, production → medium).
 * @param {string} type normalized
 * @param {unknown} rawSeverity
 */
function coerceSeverityForType(type, rawSeverity) {
  if (type === "payment") return "critical";
  if (type === "followup" || type === "risk") return "high";
  if (type === "production") return "medium";
  return normalizeSeverity(rawSeverity);
}

/**
 * @param {{
 *   type?: string,
 *   message?: string,
 *   severity?: string,
 * }} partial
 * @returns {{ id: string, type: string, message: string, severity: string, createdAt: string, resolved: boolean } | null}
 */
function addAlert(partial) {
  if (!partial || typeof partial !== "object") return null;
  const type = normalizeType(partial.type);
  const message = String(partial.message || "").trim();
  const severity = coerceSeverityForType(type, partial.severity);
  if (!type || !message) return null;

  for (const a of store.alerts) {
    if (
      a &&
      !a.resolved &&
      a.type === type &&
      String(a.message || "").trim() === message
    ) {
      return a;
    }
  }

  const row = {
    id: newId(),
    type,
    message,
    severity,
    createdAt: new Date().toISOString(),
    resolved: false,
    escalationLevel: 0,
  };
  store.alerts.push(row);
  while (store.alerts.length > MAX_ALERTS) {
    store.alerts.shift();
  }
  return row;
}

/**
 * @returns {object[]}
 */
function getActiveAlerts() {
  return store.alerts
    .filter((a) => a && a.resolved !== true)
    .map((a) => ({ ...a }));
}

/**
 * @param {unknown} id
 */
function resolveAlert(id) {
  const sid = String(id || "").trim();
  for (const a of store.alerts) {
    if (a && a.id === sid) {
      a.resolved = true;
      return true;
    }
  }
  return false;
}

/**
 * Mutate each unresolved alert in place (for escalation pass).
 * @param {(a: object) => void} fn
 */
function mutateActiveAlerts(fn) {
  for (const a of store.alerts) {
    if (a && a.resolved !== true) fn(a);
  }
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * @param {unknown} s
 */
function severityRank(s) {
  return SEVERITY_ORDER[String(s || "").toLowerCase()] ?? 99;
}

/**
 * Bundle 24 — escalation level (high first), then critical → medium, then newest.
 * @param {unknown} a
 */
function escalationRank(a) {
  const n = Number(a && a.escalationLevel);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @returns {object[]}
 */
function getActiveAlertsSorted() {
  const list = getActiveAlerts();
  list.sort((a, b) => {
    const eb = escalationRank(b);
    const ea = escalationRank(a);
    if (eb !== ea) return eb - ea;
    const d = severityRank(a.severity) - severityRank(b.severity);
    if (d !== 0) return d;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
  return list;
}

module.exports = {
  addAlert,
  getActiveAlerts,
  getActiveAlertsSorted,
  resolveAlert,
  mutateActiveAlerts,
  severityRank,
};
