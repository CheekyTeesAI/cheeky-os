"use strict";

const taskMemory = require("./taskMemory");
const memoryIndexer = require("./memoryIndexer");

function slug(s) {
  try {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 64)
      .replace(/^-+|-+$/g, "");
  } catch (_e) {
    return "";
  }
}

function rankRows(all, hint) {
  try {
    const hayStack = (all || []).map((row) => ({
      row,
      hay: `${row.summary || ""} ${(row.tags || []).join(" ")}`.toLowerCase(),
    }));
    const qtokens = hint
      ? String(hint)
          .toLowerCase()
          .split(/\W+/)
          .filter((x) => x && x.length > 2)
      : [];

    /** @type {{ memoryId:string, score:number, row:object }[]} */
    const ranked = [];
    for (let i = 0; i < hayStack.length; i++) {
      const { row, hay } = hayStack[i];
      let score = 0;
      if (hint && hay.includes(String(hint).toLowerCase().slice(0, 80))) score += 3;
      for (let t = 0; t < qtokens.length; t++) {
        if (hay.includes(qtokens[t])) score += 1;
      }
      (row.tags || []).forEach((tag) => {
        if (hint && slug(tag) === slug(hint)) score += 4;
      });
      ranked.push({ memoryId: row.memoryId, score, row });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  } catch (_e) {
    return [];
  }
}

function search(filters) {
  try {
      const idx = memoryIndexer.readIndexSafe();
      const all = taskMemory.loadAllSync();
      let pool = all.slice();

      if (filters && filters.outcome) {
        const o = String(filters.outcome).toLowerCase();
        pool = pool.filter((r) => String(r.outcome || "").toLowerCase() === o);
      }

      if (filters && filters.tag) {
        const want = slug(filters.tag);
        const mids = new Set(idx.byTag[want] || []);
        pool = pool.filter((r) => mids.has(r.memoryId));
      }

      if (filters && filters.targetSlug) {
        const want = slug(filters.targetSlug);
        const mids = new Set(idx.byTargetSlug[want] || []);
        pool = pool.filter((r) => mids.has(r.memoryId));
      }

      /** fuzzy target */
      let hint =
        filters && (filters.query || filters.similarTo)
          ? String(filters.query || filters.similarTo)
          : filters && filters.target
            ? String(filters.target)
            : filters && filters.targetSlug
              ? String(filters.targetSlug)
              : "";

      if (!pool.length && hint) {
        pool = rankRows(all, hint)
          .filter((x) => x.score > 0)
          .map((x) => x.row);
      }

      const ranked = hint ? rankRows(pool.length ? pool : all, hint) : pool.map((row) => ({ memoryId: row.memoryId, score: 1, row }));

      return {
        success: true,
        results: ranked
          .filter((x) => x.row)
          .slice(0, Math.min(40, ranked.length)),
      };
    } catch (e) {
      return { success: false, error: e.message || String(e), results: [] };
    }
}

module.exports = {
  search,
};
