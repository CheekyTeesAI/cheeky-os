/**
 * Bundle 12 — job memory (notes, decisions, flags, history) stored as JSON on CaptureOrder.
 */

function isoNow() {
  return new Date().toISOString();
}

/** @returns {{ notes: object[], decisions: object[], flags: object[], history: object[] }} */
function emptyInner() {
  return {
    notes: [],
    decisions: [],
    flags: [],
    history: [],
  };
}

/**
 * @param {unknown} order
 */
function parseInnerFromOrder(order) {
  const raw =
    order && typeof order === "object" && "memoryJson" in order
      ? String(/** @type {Record<string, unknown>} */ (order).memoryJson || "")
      : "";
  if (!raw || !raw.trim()) return emptyInner();
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return emptyInner();
    return {
      notes: Array.isArray(j.notes) ? j.notes : [],
      decisions: Array.isArray(j.decisions) ? j.decisions : [],
      flags: Array.isArray(j.flags) ? j.flags : [],
      history: Array.isArray(j.history) ? j.history : [],
    };
  } catch {
    return emptyInner();
  }
}

/**
 * @param {unknown} order
 * @returns {{
 *   orderId: string,
 *   notes: object[],
 *   decisions: object[],
 *   flags: object[],
 *   history: object[]
 * }}
 */
function getMemory(order) {
  const orderId =
    order && typeof order === "object" && order && "id" in order
      ? String(/** @type {Record<string, unknown>} */ (order).id || "")
      : "";
  const inner = parseInnerFromOrder(order);
  return {
    orderId,
    notes: inner.notes,
    decisions: inner.decisions,
    flags: inner.flags,
    history: inner.history,
  };
}

/**
 * @param {unknown} order
 * @param {string} text
 * @param {"founder"|"system"} [source]
 */
function addNote(order, text, source) {
  const inner = parseInnerFromOrder(order);
  const src = source === "system" ? "system" : "founder";
  const t = String(text == null ? "" : text).trim();
  const note = {
    text: t,
    source: src,
    createdAt: isoNow(),
  };
  if (t) {
    inner.notes.push(note);
    inner.history.push({
      event: "Founder note added",
      createdAt: isoNow(),
    });
  }
  const orderId =
    order && typeof order === "object" && order && "id" in order
      ? String(/** @type {Record<string, unknown>} */ (order).id || "")
      : "";
  return {
    memory: {
      orderId,
      notes: inner.notes,
      decisions: inner.decisions,
      flags: inner.flags,
      history: inner.history,
    },
    noteAdded: t ? note : null,
    innerForStore: inner,
  };
}

/**
 * @param {unknown} order
 * @param {string} text
 * @param {"founder"|"system"} [source]
 */
function addDecision(order, text, source) {
  const inner = parseInnerFromOrder(order);
  const src = source === "system" ? "system" : "founder";
  const t = String(text == null ? "" : text).trim();
  const decision = {
    text: t,
    source: src,
    createdAt: isoNow(),
  };
  if (t) {
    inner.decisions.push(decision);
    inner.history.push({
      event: "Founder decision recorded",
      createdAt: isoNow(),
    });
  }
  const orderId =
    order && typeof order === "object" && order && "id" in order
      ? String(/** @type {Record<string, unknown>} */ (order).id || "")
      : "";
  return {
    memory: {
      orderId,
      notes: inner.notes,
      decisions: inner.decisions,
      flags: inner.flags,
      history: inner.history,
    },
    decisionAdded: t ? decision : null,
    innerForStore: inner,
  };
}

/**
 * @param {unknown} order
 * @param {string} label
 * @param {"low"|"medium"|"high"} [severity]
 */
function addFlag(order, label, severity) {
  const inner = parseInnerFromOrder(order);
  const sev =
    severity === "high" || severity === "medium" || severity === "low"
      ? severity
      : "medium";
  const flag = {
    label: String(label == null ? "" : label).trim(),
    severity: sev,
    createdAt: isoNow(),
  };
  if (flag.label) inner.flags.push(flag);
  const orderId =
    order && typeof order === "object" && order && "id" in order
      ? String(/** @type {Record<string, unknown>} */ (order).id || "")
      : "";
  return {
    memory: {
      orderId,
      notes: inner.notes,
      decisions: inner.decisions,
      flags: inner.flags,
      history: inner.history,
    },
    innerForStore: inner,
  };
}

/**
 * @param {unknown} order
 * @param {string} event
 */
function addHistory(order, event) {
  const inner = parseInnerFromOrder(order);
  const ev = String(event == null ? "" : event).trim();
  if (ev) {
    inner.history.push({
      event: ev,
      createdAt: isoNow(),
    });
  }
  const orderId =
    order && typeof order === "object" && order && "id" in order
      ? String(/** @type {Record<string, unknown>} */ (order).id || "")
      : "";
  return {
    memory: {
      orderId,
      notes: inner.notes,
      decisions: inner.decisions,
      flags: inner.flags,
      history: inner.history,
    },
    innerForStore: inner,
  };
}

/**
 * @param {{ notes: object[], decisions: object[], flags: object[], history: object[] }} inner
 */
function memoryInnerToJson(inner) {
  return JSON.stringify({
    notes: inner.notes,
    decisions: inner.decisions,
    flags: inner.flags,
    history: inner.history,
  });
}

module.exports = {
  getMemory,
  addNote,
  addDecision,
  addFlag,
  addHistory,
  memoryInnerToJson,
  parseInnerFromOrder,
};
