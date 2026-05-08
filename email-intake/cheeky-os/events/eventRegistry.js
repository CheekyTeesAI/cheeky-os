"use strict";

/**
 * Lightweight registry for durable expanded events — validation only (no outbound I/O).
 */

const KNOWN_TYPES = new Set(
  /** @type {string[]} */ ([
    "invoice_paid",
    "invoice_created",
    "order_created",
    "order_updated",
    "task_created",
    "task_failed",
    "task_completed",
    "production_started",
    "production_completed",
    "qc_failed",
    "qc_passed",
    "customer_replied",
    "shipment_delivered",
    "shipment_created",
    "estimate_sent",
    "estimate_approved",
    "deposit_received",
    "agent_intel_smoke",
  ])
);

/**
 * @param {object | null | undefined} evt
 */
function coerceEvent(evt) {
  try {
    if (!evt || typeof evt !== "object") return null;
    return evt;
  } catch (_e) {
    return null;
  }
}

/**
 * Unknown types are rejected (fail-closed semantics for append path).
 *
 * @param {object | null | undefined} evt
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateEvent(evt) {
  const errors = [];
  try {
    const E = coerceEvent(evt);
    if (!E) {
      errors.push("missing_event_object");
      return { ok: false, errors };
    }
    const t = String(E.type || E.eventType || "").trim();
    if (!t) {
      errors.push("missing_type");
    } else if (!KNOWN_TYPES.has(t)) {
      errors.push(`unknown_type:${t}`);
    }
    if (!E.payload || typeof E.payload !== "object") {
      errors.push("payload_must_be_object");
    }
    return { ok: !errors.length, errors };
  } catch (_e) {
    return { ok: false, errors: ["validate_threw"] };
  }
}

module.exports = {
  KNOWN_TYPES,
  validateEvent,
};
