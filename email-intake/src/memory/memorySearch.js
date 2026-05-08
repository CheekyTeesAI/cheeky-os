"use strict";

const idx = require("./memoryIndexer");
const rank = require("./memoryRanking");

function normalizeLimit(limit, fallback) {
  const nRaw = Number(limit);
  return Number.isFinite(nRaw)
    ? Math.min(250, Math.max(1, Math.floor(nRaw)))
    : Math.min(250, Math.max(1, fallback || 30));
}

/**
 * @param {string} query
 * @param {{ limit?: number, entityType?: string, entityId?: string, memoryTypes?: string[] }} [options]
 */
function searchMemory(query, options) {
  options = options && typeof options === "object" ? options : {};

  try {
    const summaryQuery = typeof query === "string" ? query : "";
    const q = summaryQuery.trim();
    const qLcLower = q.toLowerCase();

    const limit = normalizeLimit(options.limit, 30);

    /** @type {Set<string>} */
    const cand = new Set();

    const entityTypeNorm =
      options.entityType != null && options.entityType !== undefined
        ? String(options.entityType).toLowerCase().trim()
        : "";
    const entityIdNorm =
      options.entityId != null && options.entityId !== undefined
        ? String(options.entityId).toLowerCase().trim()
        : "";

    if (entityTypeNorm.length || entityIdNorm.length) {
      idx.getCandidateFragmentIdsForEntity(entityTypeNorm, entityIdNorm).forEach((id) => cand.add(id));
    }

    const tokens = rank.tokenize(q);
    tokens.forEach((t) =>
      idx
        .getCandidateFragmentIdsForKeyword(String(t))
        .forEach((id) => cand.add(id))
    );

    if (qLcLower.length >= 3) idx.getCandidateFragmentIdsForKeyword(qLcLower).forEach((id) => cand.add(id));

    let fragments = idx.getFragmentsByIds(Array.from(cand));

    if (Array.isArray(options.memoryTypes) && options.memoryTypes.length) {
      const allow = options.memoryTypes.map((x) => String(x));
      fragments = fragments.filter((fr) => allow.indexOf(fr.memoryType) >= 0);
    }

    /** broad fallback — recent window scanned by ranker keywords */
    if (!fragments.length) {
      fragments = idx.getAllFragmentsChrono(400);
    }

    let ranked = rank.rankMemoryResults(fragments, summaryQuery || "");
    ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
    ranked = ranked.slice(0, limit);

    return {
      ok: true,
      query: summaryQuery,
      totalResults: ranked.length,
      results: ranked,
    };
  } catch (e) {
    return {
      ok: false,
      query: typeof query === "string" ? query : "",
      totalResults: 0,
      results: [],
      error: e && e.message ? e.message : String(e),
    };
  }
}

function searchCustomerMemory(customer) {
  try {
    const needle = String(customer || "").trim();
    /** @type {Set<string>} */
    const cand = new Set();

    idx.getCandidateFragmentIdsForEntity("customer", needle.toLowerCase()).forEach((id) => cand.add(id));

    needle
      .toLowerCase()
      .split(/[^a-z0-9_@.+-:]+/gi)
      .filter((t) => t && t.length > 1)
      .forEach((t) => idx.getCandidateFragmentIdsForKeyword(String(t)).forEach((id) => cand.add(id)));

    idx.getCandidateFragmentIdsForKeyword(needle.toLowerCase()).forEach((id) => cand.add(id));

    let fragments = idx.getFragmentsByIds(Array.from(cand));

    const seenDup = {};
    fragments = fragments.filter((f) => {
      if (!f || !f.id || seenDup[f.id]) return false;
      seenDup[f.id] = true;
      return true;
    });

    if (needle.length) {
      fragments = fragments.filter((fr) => {
        try {
          const hay =
            `${fr.searchableText || ""}|${fr.summary || ""}|${fr.entityId != null ? fr.entityId : ""}`.toLowerCase();
          const n = needle.toLowerCase();
          return hay.includes(n);
        } catch (_e2) {
          return false;
        }
      });
    }

    let ranked = rank.rankMemoryResults(fragments, needle);
    ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
    ranked = ranked.slice(0, normalizeLimit(undefined, 50));

    return {
      ok: true,
      query: needle,
      totalResults: ranked.length,
      results: ranked,
    };
  } catch (_e3) {
    return {
      ok: false,
      query: String(customer || ""),
      totalResults: 0,
      results: [],
      error: "searchCustomerMemory_failed",
    };
  }
}

function searchRecentOperationalContext(query) {
  try {
    const base = idx.getAllFragmentsChrono(400);
    const ranked = rank
      .rankMemoryResults(base, query || "")
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    const slice = ranked.slice(0, 60);

    return {
      ok: true,
      query: String(query || ""),
      totalResults: slice.length,
      results: slice,
    };
  } catch (_e4) {
    return { ok: false, query: String(query || ""), totalResults: 0, results: [], error: "recent_context_failed" };
  }
}

module.exports = {
  searchMemory,
  searchCustomerMemory,
  searchRecentOperationalContext,
};
