"use strict";

const { randomUUID } = require("crypto");

const eventPersistence = require("./persistence/eventPersistence");

const DEFAULT_CAP = 5000;
let maxEvents =
  typeof process.env.BRIDGE_EVENT_STORE_CAP === "string" && /^[0-9]+$/.test(process.env.BRIDGE_EVENT_STORE_CAP.trim())
    ? Math.min(parseInt(process.env.BRIDGE_EVENT_STORE_CAP, 10), 50000)
    : DEFAULT_CAP;

/** @type {object[]} */
let events = [];
/** @type {Set<string>} */
const idRegistry = new Set();

let replayHydrated = false;

function ensureReplayed() {
  if (replayHydrated) return;
  replayHydrated = true;
  try {
    const stats = require("./persistence/eventReplay").replayPersistedEventsIntoStore();
    const replayed = stats && typeof stats.replayed === "number" ? stats.replayed : 0;
    const skipped = stats && typeof stats.skipped === "number" ? stats.skipped : 0;
    console.log(`[Bridge] Replayed ${replayed} persisted events${skipped ? ` (${skipped} duplicate ids skipped)` : ""}`);
  } catch (e) {
    console.warn("[Bridge] replay warning:", e && e.message ? e.message : String(e));
  }
}

/** @internal replay — prune once after bulk ingest */
function finalizeReplayBatch() {
  prune();
  try {
    require("../memory/memoryIndexer").rebuildMemoryIndex(events.slice());
  } catch (_memErr) {
    /* never block bridge */
  }
}

function normalizeEvent(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const nowIso = new Date().toISOString();
  return {
    id: input.id && String(input.id).trim() ? String(input.id) : randomUUID(),
    type: String(input.type || "UNKNOWN_EVENT").trim(),
    timestamp: typeof input.timestamp === "string" && input.timestamp.trim() ? input.timestamp : nowIso,
    source: input.source !== undefined ? input.source === null ? null : String(input.source) : "bridge",
    entityType:
      input.entityType !== undefined && input.entityType !== null ? String(input.entityType).trim() : null,
    entityId: input.entityId !== undefined && input.entityId !== null ? input.entityId : null,
    actor: input.actor !== undefined && input.actor !== null ? String(input.actor) : null,
    payload: typeof input.payload === "object" && input.payload !== null ? input.payload : {},
    metadata: typeof input.metadata === "object" && input.metadata !== null ? input.metadata : {},
  };
}

function syncPruneDropFromRegistry(dropCount) {
  if (!(dropCount > 0) || dropCount > events.length) return;
  for (let i = 0; i < dropCount; i++) {
    const id = events[i].id && String(events[i].id).trim();
    if (id) idRegistry.delete(id);
  }
}

function prune() {
  if (events.length <= maxEvents) return;
  const drop = events.length - maxEvents;
  syncPruneDropFromRegistry(drop);
  events = events.slice(-maxEvents);
}

function matchesFilter(ev, filter) {
  if (!filter || typeof filter !== "object") return true;
  if (filter.type !== undefined && filter.type !== null && filter.type !== ev.type) return false;
  if (filter.entityType !== undefined && filter.entityType !== null && filter.entityType !== ev.entityType)
    return false;
  if (filter.entityId !== undefined && filter.entityId !== null && String(filter.entityId) !== String(ev.entityId))
    return false;
  return true;
}

/**
 * @param {object} parsedCore — event fields without persistedAt/schemaVersion
 * @returns {{ ok: boolean, skipped?: boolean, error?: string }}
 */
function ingestReplayedEvent(parsedCore) {
  try {
    const ev = normalizeEvent(parsedCore || {});
    const idStr = ev.id ? String(ev.id) : "";
    if (!idStr) {
      return { ok: false, error: "missing_id_after_normalize" };
    }
    if (idRegistry.has(idStr)) return { ok: true, skipped: true };
    idRegistry.add(idStr);
    events.push(ev);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

/**
 * @param {object} event — partial normalized by caller preference
 * @returns {{ ok: true, event: object } | { ok: false, error: string, duplicate?: boolean }}
 */
function appendEvent(event) {
  ensureReplayed();
  try {
    const ev = normalizeEvent(event || {});
    const idStr = ev.id ? String(ev.id).trim() : "";
    if (!idStr) {
      return { ok: false, error: "missing_event_id_after_normalize" };
    }
    if (idRegistry.has(idStr)) {
      /** Collisions should be exceedingly rare — drop duplicate emits */
      console.warn("[Bridge] duplicate append rejected:", idStr);
      return { ok: false, error: "duplicate_event_id", duplicate: true };
    }
    idRegistry.add(idStr);
    events.push(ev);
    const lenBeforePrune = events.length;
    prune();

    try {
      const memIdx = require("../memory/memoryIndexer");
      if (events.length < lenBeforePrune) memIdx.rebuildMemoryIndex(events.slice());
      else memIdx.indexEvent(ev);
    } catch (_memErr) {
      /* never block bridge */
    }

    const persisted = eventPersistence.persistEvent(ev);
    if (!persisted.ok) {
      console.warn("[Bridge] persist warning:", persisted.error || "persistEvent_failed");
    }

    return { ok: true, event: ev };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function listEvents(filter) {
  ensureReplayed();
  try {
    const list = events.filter((e) => matchesFilter(e, filter));
    return { ok: true, events: list.slice() };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), events: [] };
  }
}

function getRecentEvents(limit) {
  ensureReplayed();
  try {
    const nRaw = Number(limit);
    const n =
      Number.isFinite(nRaw) ? Math.min(500, Math.max(1, Math.floor(nRaw))) : 10;
    const slice = events.slice(-n);
    return { ok: true, events: slice.slice().reverse() };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), events: [] };
  }
}

function getEventsByEntity(entityType, entityId) {
  ensureReplayed();
  try {
    return listEvents({
      entityType,
      entityId,
    });
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), events: [] };
  }
}

function getInMemoryCount() {
  ensureReplayed();
  try {
    return events.length;
  } catch (_e) {
    return 0;
  }
}

module.exports = {
  appendEvent,
  listEvents,
  getRecentEvents,
  getEventsByEntity,
  getInMemoryCount,
  ingestReplayedEvent,
  finalizeReplayBatch,
};
