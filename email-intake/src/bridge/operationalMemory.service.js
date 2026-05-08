"use strict";

const eventBus = require("./eventBus");
const eventStore = require("./eventStore");

function recordMemoryEvent(event) {
  try {
    return eventBus.publishEvent(event);
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function getRecentMemory(limit) {
  try {
    return eventStore.getRecentEvents(limit);
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), events: [] };
  }
}

function getEntityTimeline(entityType, entityId) {
  try {
    return eventStore.getEventsByEntity(entityType, entityId);
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), events: [] };
  }
}

function haystack(ev) {
  try {
    return JSON.stringify({
      type: ev.type,
      payload: ev.payload,
      metadata: ev.metadata,
      entityId: ev.entityId,
      entityType: ev.entityType,
    }).toLowerCase();
  } catch (_e) {
    return "";
  }
}

function buildCustomerContext(customerIdentifier) {
  try {
    const raw = customerIdentifier !== undefined && customerIdentifier !== null ? String(customerIdentifier) : "";
    const needle = raw.trim().toLowerCase();

    if (!needle) {
      return {
        ok: true,
        customerIdentifier: raw,
        matchedEventCount: 0,
        events: [],
        summary: "EMPTY_CUSTOMER_KEY",
      };
    }

    const recent = eventStore.getRecentEvents(2000);
    const ordered = recent.ok ? recent.events : [];

    /** @type {object[]} */
    const hits = [];
    for (let i = 0; i < ordered.length && hits.length < 100; i++) {
      const ev = ordered[i];
      const hay = haystack(ev);
      const entityMatch =
        ev.entityType &&
        String(ev.entityType).toLowerCase() === "customer" &&
        ev.entityId != null &&
        String(ev.entityId).toLowerCase().includes(needle);
      const payloadMatch = hay.includes(needle);
      if (entityMatch || payloadMatch) hits.push(ev);
    }

    return {
      ok: true,
      customerIdentifier: raw,
      matchedEventCount: hits.length,
      events: hits,
      summary:
        hits.length === 0
          ? "NO_MATCH_IN_RECENT_MEMORY_WINDOW"
          : "MATCHED_EVENTS_INCLUDED",
    };
  } catch (e) {
    return {
      ok: false,
      error: e && e.message ? e.message : String(e),
      customerIdentifier: String(customerIdentifier),
      matchedEventCount: 0,
      events: [],
      summary: "ERROR_BUILDING_CONTEXT",
    };
  }
}

module.exports = {
  recordMemoryEvent,
  getRecentMemory,
  getEntityTimeline,
  buildCustomerContext,
};
