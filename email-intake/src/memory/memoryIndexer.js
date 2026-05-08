"use strict";

const mf = require("./memoryFragments");

/** @type {Map<string, object>} */
const fragmentsById = new Map();
/** @type {Map<string, Set<string>>} */
const byEntityId = new Map();
/** @type {Map<string, Set<string>>} */
const byEntityType = new Map();
/** @type {Map<string, Set<string>>} */
const byKeyword = new Map();
/** @type {Map<string, Set<string>>} */
const byMemoryType = new Map();

let lastRebuildAtIso = null;
let indexingErrors = 0;

function normalizeKeySegment(s) {
  return String(s || "")
    .toLowerCase()
    .trim();
}

function safeAddToMultimap(multi, keyRaw, fragmentId) {
  const key = normalizeKeySegment(keyRaw);
  if (!key || !fragmentId) return;
  if (!multi.has(key)) multi.set(key, new Set());
  multi.get(key).add(fragmentId);
}

function clearIndexes() {
  fragmentsById.clear();
  byEntityId.clear();
  byEntityType.clear();
  byKeyword.clear();
  byMemoryType.clear();
}

/** @internal */
function indexFragment(frag) {
  if (!frag || typeof frag !== "object" || !frag.id) return false;
  const fid = frag.id;
  fragmentsById.set(fid, frag);

  if (frag.memoryType != null) safeAddToMultimap(byMemoryType, String(frag.memoryType), fid);
  if (frag.entityType != null) safeAddToMultimap(byEntityType, String(frag.entityType), fid);

  const eidNorm = normalizeKeySegment(frag.entityId != null ? String(frag.entityId) : "");
  if (eidNorm) safeAddToMultimap(byEntityId, eidNorm, fid);

  const kws = Array.isArray(frag.keywords) ? frag.keywords : [];
  for (let i = 0; i < kws.length; i++) {
    const kwPiece = typeof kws[i] === "string" ? kws[i].toLowerCase() : `${kws[i]}`.toLowerCase();
    safeAddToMultimap(byKeyword, kwPiece, fid);
  }

  return true;
}

/**
 * @param {object} bridgeEvent canonical bridge event envelope
 */
function indexEvent(bridgeEvent) {
  try {
    const frag = mf.buildMemoryFragment(bridgeEvent);
    if (!frag) {
      indexingErrors++;
      return { ok: false, error: "fragment_build_failed" };
    }
    indexFragment(frag);
    return { ok: true };
  } catch (_e) {
    indexingErrors++;
    return { ok: false, error: "indexEvent_threw" };
  }
}

/**
 * @param {object[]} bridgeEvents chronological order optional
 */
function rebuildMemoryIndex(bridgeEvents) {
  try {
    clearIndexes();
    const list = Array.isArray(bridgeEvents) ? bridgeEvents : [];
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < list.length; i++) {
      const r = indexEvent(list[i]);
      if (r && r.ok === true) ok++;
      else fail++;
    }
    lastRebuildAtIso = new Date().toISOString();
    return { ok: true, indexed: ok, failed: fail, totalIncoming: list.length };
  } catch (_e) {
    indexingErrors++;
    lastRebuildAtIso = new Date().toISOString();
    return { ok: false, indexed: 0, failed: 0, totalIncoming: 0, error: "rebuild_failed" };
  }
}

function getCandidateFragmentIdsForKeyword(keyRaw) {
  const key = normalizeKeySegment(keyRaw);
  if (!key) return [];
  /** @type {Set<string>} */
  const out = new Set();
  const exact = byKeyword.get(key);
  if (exact) exact.forEach((id) => out.add(id));

  fragmentsById.forEach((frag, fid) => {
    try {
      if (frag && frag.searchableText && frag.searchableText.includes(key)) out.add(fid);
    } catch (_e2) {}
  });

  return Array.from(out);
}

function collectUnionByTokens(tokensLower) {
  /** @type {Set<string>} */
  const uni = new Set();
  tokensLower.forEach((t) => getCandidateFragmentIdsForKeyword(String(t)).forEach((id) => uni.add(id)));
  return Array.from(uni);
}

function getCandidateFragmentIdsForEntity(entityTypeNorm, entityIdNorm) {
  /** @type {Set<string>} */
  const s = new Set();
  const eidNorm = normalizeKeySegment(entityIdNorm);
  const etNorm = normalizeKeySegment(entityTypeNorm);

  const fromId = byEntityId.get(eidNorm);
  if (fromId) fromId.forEach((x) => s.add(x));

  if (etNorm && eidNorm) {
    const fromType = byEntityType.get(etNorm);
    if (fromType) {
      fromType.forEach((fid) => {
        const f = fragmentsById.get(fid);
        try {
          if (f && normalizeKeySegment(String(f.entityId || "")) === eidNorm) s.add(fid);
        } catch (_e) {}
      });
    }
  }
  return Array.from(s);
}

function getFragmentsByIds(ids) {
  const arr = [];
  for (let i = 0; i < ids.length; i++) {
    const fr = fragmentsById.get(ids[i]);
    if (fr) arr.push(fr);
  }
  return arr;
}

function getAllFragmentsChrono(limit) {
  try {
    const all = Array.from(fragmentsById.values()).sort((a, b) => {
      const ta = String(a.timestamp || "");
      const tb = String(b.timestamp || "");
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    const n = Math.min(5000, Math.max(1, limit || 500));
    return all.slice(0, n);
  } catch (_e) {
    return [];
  }
}

function getMemoryIndexStats() {
  try {
    return {
      fragments: fragmentsById.size,
      uniqueKeywordsIndexed: byKeyword.size,
      uniqueEntityIds: byEntityId.size,
      uniqueEntityTypes: byEntityType.size,
      memoryTypeBuckets: byMemoryType.size,
      indexingErrors,
      lastRebuildAtIso,
    };
  } catch (_e) {
    return {
      fragments: 0,
      uniqueKeywordsIndexed: 0,
      uniqueEntityIds: 0,
      uniqueEntityTypes: 0,
      memoryTypeBuckets: 0,
      indexingErrors,
      lastRebuildAtIso,
    };
  }
}

module.exports = {
  indexEvent,
  rebuildMemoryIndex,
  getMemoryIndexStats,
  collectUnionByTokens,
  getCandidateFragmentIdsForKeyword,
  getCandidateFragmentIdsForEntity,
  getFragmentsByIds,
  getAllFragmentsChrono,
};
