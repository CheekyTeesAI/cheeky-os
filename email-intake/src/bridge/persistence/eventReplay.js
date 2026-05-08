"use strict";

const eventPersistence = require("./eventPersistence");
const eventStore = require("../eventStore");

/** @type {{ replayed: number, skipped: number, failed: number }} */
let lastReplayStats = { replayed: 0, skipped: 0, failed: 0 };

function getLastReplayStats() {
  return Object.assign({}, lastReplayStats);
}

/**
 * Load JSONL and merge into in-memory store without duplicating ids.
 */
function replayPersistedEventsIntoStore() {
  lastReplayStats = { replayed: 0, skipped: 0, failed: 0 };

  try {
    const load = eventPersistence.loadPersistedEvents();
    if (!load.ok || !Array.isArray(load.events)) {
      lastReplayStats.failed++;
      return getLastReplayStats();
    }

    for (let i = 0; i < load.events.length; i++) {
      const row = load.events[i];
      const core = eventPersistence.stripPersistenceFields(row);
      if (!core || !core.id || !String(core.id).trim()) {
        lastReplayStats.failed++;
        continue;
      }
      const ingest = eventStore.ingestReplayedEvent(core);
      if (!ingest || !ingest.ok) {
        lastReplayStats.failed++;
        continue;
      }
      if (ingest.skipped) lastReplayStats.skipped++;
      else lastReplayStats.replayed++;
    }

    eventStore.finalizeReplayBatch();
    return getLastReplayStats();
  } catch (e) {
    lastReplayStats.failed++;
    return getLastReplayStats();
  }
}

module.exports = {
  replayPersistedEventsIntoStore,
  getLastReplayStats,
};
