/**
 * Bundle 39 — in-memory founder exception approval queue.
 */

const MAX_EXCEPTIONS = 50;

/** @type {{ exceptions: object[] }} */
const store = {
  exceptions: [],
};

function newId() {
  return `exc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {object} e
 */
function pendingKey(e) {
  const type = String((e && e.type) || "");
  const orderId = String((e && e.orderId) || "").trim();
  const reason = String((e && e.reason) || "").trim();
  return `${type}|${orderId}|${reason}`;
}

function trimStore() {
  while (store.exceptions.length > MAX_EXCEPTIONS) {
    const resolvedIdx = [];
    for (let i = 0; i < store.exceptions.length; i++) {
      const e = store.exceptions[i];
      if (e && e.status && e.status !== "pending") resolvedIdx.push(i);
    }
    if (resolvedIdx.length) {
      let oldestI = resolvedIdx[0];
      let oldestT = new Date(
        store.exceptions[oldestI].resolvedAt || store.exceptions[oldestI].createdAt || 0
      ).getTime();
      for (const i of resolvedIdx) {
        const t = new Date(
          store.exceptions[i].resolvedAt || store.exceptions[i].createdAt || 0
        ).getTime();
        if (t < oldestT) {
          oldestT = t;
          oldestI = i;
        }
      }
      store.exceptions.splice(oldestI, 1);
      continue;
    }
    let oldestJ = 0;
    let oldestCt = Infinity;
    for (let j = 0; j < store.exceptions.length; j++) {
      const t = new Date(store.exceptions[j].createdAt || 0).getTime();
      if (t < oldestCt) {
        oldestCt = t;
        oldestJ = j;
      }
    }
    store.exceptions.splice(oldestJ, 1);
  }
}

const ALLOWED_TYPES = new Set(["pricing", "payment", "production", "automation"]);

/**
 * @param {object} item
 * @returns {{ added: boolean, id: string | null }}
 */
function addException(item) {
  try {
    if (!item || typeof item !== "object") return { added: false, id: null };
    const type = String(item.type || "").toLowerCase();
    if (!ALLOWED_TYPES.has(type)) return { added: false, id: null };

    const orderId = String(item.orderId != null ? item.orderId : "").trim();
    const reason = String(item.reason != null ? item.reason : "").trim() || "Exception";
    const customerName = String(item.customerName != null ? item.customerName : "").trim();
    const sevRaw = String(item.severity || "medium").toLowerCase();
    const severity = ["critical", "high", "medium", "low"].includes(sevRaw)
      ? sevRaw
      : "medium";

    const probe = { type, orderId, reason };
    const k = pendingKey(probe);
    const hasDup = store.exceptions.some(
      (e) => e && e.status === "pending" && pendingKey(e) === k
    );
    if (hasDup) return { added: false, id: null };

    const id = newId();
    const row = {
      id,
      type,
      customerName,
      orderId,
      severity,
      reason,
      status: "pending",
      createdAt: new Date().toISOString(),
      resolvedAt: "",
      resolvedBy: "",
    };
    store.exceptions.unshift(row);
    trimStore();
    return { added: true, id };
  } catch {
    return { added: false, id: null };
  }
}

function getPendingExceptions() {
  try {
    const out = store.exceptions.filter((e) => e && e.status === "pending");
    const rank = (s) => {
      const u = String(s || "").toLowerCase();
      if (u === "critical") return 0;
      if (u === "high") return 1;
      if (u === "medium") return 2;
      return 3;
    };
    return out.sort((a, b) => rank(a.severity) - rank(b.severity));
  } catch {
    return [];
  }
}

function getAllExceptionsForDebug() {
  return [...store.exceptions];
}

/** @returns {object[]} */
function getApprovedExceptions() {
  try {
    return store.exceptions
      .filter((e) => e && e.status === "approved")
      .sort(
        (a, b) =>
          new Date(b.resolvedAt || 0).getTime() -
          new Date(a.resolvedAt || 0).getTime()
      );
  } catch {
    return [];
  }
}

/**
 * @param {string} id
 * @param {string} resolvedBy
 * @returns {{ ok: boolean }}
 */
function approveException(id, resolvedBy) {
  const sid = String(id || "").trim();
  if (!sid) return { ok: false };
  const ex = store.exceptions.find((e) => e && e.id === sid);
  if (!ex || ex.status !== "pending") return { ok: false };
  ex.status = "approved";
  ex.resolvedAt = new Date().toISOString();
  ex.resolvedBy = String(resolvedBy || "").trim() || "unknown";
  return { ok: true };
}

/**
 * @param {string} id
 * @param {string} resolvedBy
 * @returns {{ ok: boolean }}
 */
function rejectException(id, resolvedBy) {
  const sid = String(id || "").trim();
  if (!sid) return { ok: false };
  const ex = store.exceptions.find((e) => e && e.id === sid);
  if (!ex || ex.status !== "pending") return { ok: false };
  ex.status = "rejected";
  ex.resolvedAt = new Date().toISOString();
  ex.resolvedBy = String(resolvedBy || "").trim() || "unknown";
  return { ok: true };
}

module.exports = {
  addException,
  getPendingExceptions,
  approveException,
  rejectException,
  getAllExceptionsForDebug,
  getApprovedExceptions,
};
