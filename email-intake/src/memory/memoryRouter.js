"use strict";

const path = require("path");

const eventPersistence = require(path.join(__dirname, "..", "bridge", "persistence", "eventPersistence"));
const indexer = require("./memoryIndexer");
const search = require("./memorySearch");
const timeline = require("./memoryTimeline");

/**
 * Structured search façade over bridged semantic memory fragments.
 */
function searchBridgeMemory(query, options) {
  try {
    return search.searchMemory(query || "", options || {});
  } catch (_e) {
    return { ok: false, query: String(query || ""), totalResults: 0, results: [], error: "search_failed" };
  }
}

/**
 * Timeline helper — resolves either entity anchors or fuzzy customer timelines.
 *
 * @param {{ entityType?: string, entityId?: string, customer?: string }} spec
 */
function getMemoryTimeline(spec) {
  const s = spec && typeof spec === "object" ? spec : {};

  try {
    if (s.customer != null && String(s.customer).trim()) {
      return timeline.buildCustomerTimeline(String(s.customer).trim());
    }
    const et = s.entityType != null ? String(s.entityType).trim() : "";
    const eid = s.entityId != null ? String(s.entityId).trim() : "";

    const builtEntity = timeline.buildEntityTimeline(et, eid);
    if (!(builtEntity && builtEntity.entries && builtEntity.entries.length) && (et || eid)) {
      return timeline.buildCustomerTimeline(`${et} ${eid}`.trim());
    }
    return builtEntity;
  } catch (_e2) {
    return { ok: false, entries: [], groups: [], error: "timeline_failed" };
  }
}

/**
 * Rebuild index from persisted JSONL (full-history path).
 */
function rebuildMemoryIndexes() {
  try {
    const load = eventPersistence.loadPersistedEvents();
    if (!load.ok || !Array.isArray(load.events)) {
      const empty = indexer.rebuildMemoryIndex([]);
      return Object.assign(empty, {
        persistedRows: 0,
        storagePath: eventPersistence.STORAGE_FILE,
        note: "load_failed_fallback_empty",
      });
    }

    const cores = [];

    load.events.forEach((row) => {
      try {
        const stripped = eventPersistence.stripPersistenceFields(row);
        if (stripped && stripped.id != null && String(stripped.id).trim()) cores.push(stripped);
      } catch (_e3) {}
    });

    const res = indexer.rebuildMemoryIndex(cores);
    return Object.assign({}, res, {
      persistedRows: load.events.length,
      usableCanonicalEvents: cores.length,
      storagePath: eventPersistence.STORAGE_FILE,
    });
  } catch (_e4) {
    try {
      return indexer.rebuildMemoryIndex([]);
    } catch (_e5) {
      return { ok: false, error: "rebuild_fatal" };
    }
  }
}

module.exports = {
  searchBridgeMemory,
  getMemoryTimeline,
  rebuildMemoryIndexes,
};
