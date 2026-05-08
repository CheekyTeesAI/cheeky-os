"use strict";

const eventStore = require("./eventStore");

/** @type {Map<string, Function[]>} */
const subscribersByType = new Map();

function subscribe(eventType, handler) {
  try {
    const t = String(eventType || "").trim();
    if (!t || typeof handler !== "function") return { ok: false, error: "invalid_subscribe_arguments" };
    if (!subscribersByType.has(t)) subscribersByType.set(t, []);
    subscribersByType.get(t).push(handler);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function getSubscribers() {
  try {
    /** @type {Record<string, number>} */
    const countsByType = {};
    for (const [k, arr] of subscribersByType.entries()) {
      countsByType[k] = arr.length;
    }
    return { ok: true, countsByType };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), countsByType: {} };
  }
}

function notifySubscribers(ev) {
  const list = subscribersByType.get(ev.type) || [];
  for (let i = 0; i < list.length; i++) {
    try {
      list[i](ev);
    } catch (err) {
      console.warn("[bridge-eventBus]", "subscriber_error", ev && ev.type, err && err.message ? err.message : err);
    }
  }
}

/**
 * Persist then dispatch to subscribers — subscriber failures never throw past this call.
 *
 * @param {object} event
 * @returns {{ ok: boolean, event?: object, error?: string }}
 */
function publishEvent(event) {
  try {
    const persisted = eventStore.appendEvent(event);
    if (!persisted.ok || !persisted.event) return persisted;
    notifySubscribers(persisted.event);
    return { ok: true, event: persisted.event };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = {
  publishEvent,
  subscribe,
  getSubscribers,
};
