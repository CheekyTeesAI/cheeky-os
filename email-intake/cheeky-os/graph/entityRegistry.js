"use strict";

const ENTITY_TYPES = new Set(["customer", "order", "invoice", "task", "vendor", "communication", "production_job", "event"]);

/**
 * Canonical string id: "customer:cust-123"
 *
 * @param {string} type
 * @param {string} id
 */
function makeEntityId(type, id) {
  try {
    const t = String(type || "").trim().toLowerCase();
    const i = String(id || "").trim();
    if (!t || !i) return "";
    if (!ENTITY_TYPES.has(t)) return "";
    return `${t}:${i}`;
  } catch (_e) {
    return "";
  }
}

module.exports = {
  ENTITY_TYPES,
  makeEntityId,
};
