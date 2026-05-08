"use strict";

const MT = require("./memoryTypes");

/**
 * Flatten nested objects/arrays into a single lowercase searchable string fragment.
 */
function flattenForSearch(val, depth) {
  try {
    const d = typeof depth === "number" ? depth : 0;
    if (d > 12) return "";
    if (val === undefined || val === null) return "";
    if (typeof val === "string") return `${val}\n`;
    if (typeof val === "number" || typeof val === "boolean") return `${String(val)}\n`;
    if (Array.isArray(val)) return val.map((x) => flattenForSearch(x, d + 1)).join(" ");
    if (typeof val === "object") {
      return Object.keys(val)
        .map((k) => `${k}\n${flattenForSearch(val[k], d + 1)}`)
        .join(" ");
    }
    return `${String(val)}\n`;
  } catch (_e) {
    return "";
  }
}

function inferMemoryType(event) {
  try {
    const t = event && typeof event.type === "string" ? event.type.toUpperCase() : "";
    const entityTypeRaw =
      event && event.entityType != null ? String(event.entityType).toLowerCase() : "";

    if (entityTypeRaw === "customer") return MT.CUSTOMER_MEMORY;
    if (entityTypeRaw === "order" || entityTypeRaw === "estimate") return MT.ORDER_MEMORY;

    if (t.includes("PAYMENT") || t.includes("DEPOSIT") || t.includes("INVOICE")) return MT.PAYMENT_MEMORY;
    if (t.includes("EMAIL")) return MT.EMAIL_MEMORY;
    if (t.includes("PRODUCTION")) return MT.PRODUCTION_MEMORY;
    if (t.includes("APPROVAL")) return MT.APPROVAL_MEMORY;
    if (t.includes("OPERATOR_TOOL") || t.includes("OPERATOR_COMMAND")) return MT.OPERATOR_MEMORY;
    if (t.includes("ERROR")) return MT.ERROR_MEMORY;

    return MT.OPERATOR_MEMORY;
  } catch (_e) {
    return MT.OPERATOR_MEMORY;
  }
}

function deriveKeywords(searchableText) {
  try {
    const lowered = searchableText.replace(/\s+/g, " ").trim();
    /** @type {Set<string>} */
    const uniq = new Set();
    lowered.split(/[^a-z0-9_@.+-:]+/gi).forEach((w) => {
      const t = w.toLowerCase();
      if (!t || t.length < 2) return;
      if (t.length > 72) uniq.add(t.slice(0, 72));
      else uniq.add(t);
    });
    return Array.from(uniq);
  } catch (_e) {
    return [];
  }
}

function buildSummary(event, memoryType, searchableText) {
  try {
    const et = event && typeof event.type === "string" ? event.type : "EVENT";
    const src = event && typeof event.source === "string" ? event.source : "";
    const tail = searchableText.slice(0, 160).trim().replace(/\s+/g, " ");
    const clip = tail.length > 140 ? `${tail.slice(0, 140)}…` : tail;
    return `${memoryType}:${et}${src ? `:${src}` : ""}${clip ? ` — ${clip}` : ""}`.slice(0, 400);
  } catch (_e) {
    return memoryType || MT.OPERATOR_MEMORY;
  }
}

/**
 * Normalize a persisted / bridge event envelope into memory fragment inputs.
 *
 * @param {object} event bridge-style event ({ id,type,timestamp,...,payload,metadata})
 * @returns {object|null}
 */
function buildMemoryFragment(event) {
  try {
    if (!event || typeof event !== "object") return null;
    const evIdRaw = event.id != null ? String(event.id).trim() : "";
    const sourceEventId = evIdRaw || `unknown-${Math.random().toString(36).slice(2)}`;

    const memoryType = inferMemoryType(event);
    const entityType =
      event.entityType !== undefined && event.entityType !== null ? String(event.entityType).trim().toLowerCase() : null;
    const entityId = event.entityId !== undefined && event.entityId !== null ? event.entityId : null;

    const payloadBlock = flattenForSearch(event.payload);
    const metadataBlock = flattenForSearch(event.metadata);
    const typeLine = `${event.type || ""} ${event.source || ""}`;
    let searchableRaw = `${typeLine}\n${payloadBlock}\n${metadataBlock}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    searchableRaw += entityType ? ` entitytype:${String(entityType).toLowerCase()}` : "";
    if (entityId != null) searchableRaw += ` entityid:${String(entityId).toLowerCase()}`;

    const keywords = deriveKeywords(searchableRaw.length ? searchableRaw : typeLine.toLowerCase());
    const fragmentId = `${sourceEventId}::frag`;

    return {
      id: fragmentId,
      sourceEventId,
      memoryType,
      entityType,
      entityId,
      timestamp:
        typeof event.timestamp === "string" && event.timestamp.trim()
          ? event.timestamp
          : new Date().toISOString(),
      searchableText: searchableRaw,
      keywords,
      summary: buildSummary(event, memoryType, searchableRaw),
      metadata: {
        bridgeEventType: event.type || null,
        source: event.source || null,
        actor: event.actor || null,
      },
    };
  } catch (_e) {
    return null;
  }
}

module.exports = {
  buildMemoryFragment,
  inferMemoryType,
  flattenForSearch,
};
