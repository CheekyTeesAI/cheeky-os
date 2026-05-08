"use strict";

const idx = require("./memoryIndexer");
const search = require("./memorySearch");

const NEARBY_MS = 1000 * 60 * 45;

function sortChronoAsc(entries) {
  return (Array.isArray(entries) ? entries : []).slice().sort((a, b) => {
    const ta = String(a.timestamp || "");
    const tb = String(b.timestamp || "");
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
}

function minimalFragmentView(f) {
  return {
    fragmentId: f.id,
    timestamp: f.timestamp,
    memoryType: f.memoryType,
    summary: f.summary,
    sourceEventId: f.sourceEventId,
    entityType: f.entityType,
    entityId: f.entityId,
    bridgeEventType: f.metadata ? f.metadata.bridgeEventType : undefined,
  };
}

/**
 * Group chronologically sorted fragments when gaps exceed ~45 minutes.
 *
 * @param {object[]} sortedAscFragments
 */
function groupNearby(sortedAscFragments) {
  /** @type {{ anchorTimestamp: string, count: number, summaries: object[] }[]} */
  const groups = [];
  /** @type {object[]} */
  let bucket = [];
  let lastMs = null;

  for (let i = 0; i < sortedAscFragments.length; i++) {
    const f = sortedAscFragments[i];
    const ms = Date.parse(String(f.timestamp || ""));
    if (!Number.isFinite(ms)) continue;
    const view = minimalFragmentView(f);

    if (!bucket.length) {
      bucket.push(view);
      lastMs = ms;
      continue;
    }

    if (lastMs != null && ms - lastMs > NEARBY_MS) {
      groups.push({
        anchorTimestamp: bucket[0].timestamp,
        count: bucket.length,
        summaries: bucket.slice(),
      });
      bucket = [view];
    } else {
      bucket.push(view);
    }
    lastMs = ms;
  }

  if (bucket.length) {
    groups.push({
      anchorTimestamp: bucket[0].timestamp,
      count: bucket.length,
      summaries: bucket.slice(),
    });
  }

  return groups;
}

function buildEntityTimeline(entityType, entityId) {
  try {
    const et = String(entityType || "").trim();
    const ei = String(entityId != null ? entityId : "").trim();
    let frags = idx.getFragmentsByIds(idx.getCandidateFragmentIdsForEntity(et.toLowerCase(), ei.toLowerCase()));

    if (!frags.length && et && ei) {
      const r = search.searchMemory(`${et} ${ei}`, { entityType: et, entityId: ei, limit: 100 });
      frags = r && r.results ? r.results : [];
    }

    const sorted = sortChronoAsc(frags);
    const entries = sorted.map(minimalFragmentView);

    return {
      ok: true,
      entityType: et,
      entityId: ei,
      count: entries.length,
      entries,
      groups: groupNearby(sorted),
    };
  } catch (e) {
    return {
      ok: false,
      entityType,
      entityId,
      count: 0,
      entries: [],
      groups: [],
      error: e && e.message ? e.message : String(e),
    };
  }
}

function buildCustomerTimeline(customer) {
  try {
    const r = search.searchCustomerMemory(customer);
    const frags = r && r.results ? r.results : [];
    const sorted = sortChronoAsc(frags);
    const entries = sorted.map(minimalFragmentView);

    return {
      ok: true,
      customer,
      count: entries.length,
      entries,
      groups: groupNearby(sorted),
      query: r && r.query,
    };
  } catch (e) {
    return {
      ok: false,
      customer,
      count: 0,
      entries: [],
      groups: [],
      error: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  buildEntityTimeline,
  buildCustomerTimeline,
};
