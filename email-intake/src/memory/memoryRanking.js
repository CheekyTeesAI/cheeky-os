"use strict";

const MT = require("./memoryTypes");

const RECENCY_HALF_LIFE_MS = 1000 * 60 * 60 * 96;

const MEMORY_TYPE_WEIGHT = {
  [MT.CUSTOMER_MEMORY]: 2.8,
  [MT.ORDER_MEMORY]: 2.2,
  [MT.PAYMENT_MEMORY]: 2.4,
  [MT.EMAIL_MEMORY]: 2.0,
  [MT.PRODUCTION_MEMORY]: 2.1,
  [MT.APPROVAL_MEMORY]: 1.9,
  [MT.ERROR_MEMORY]: 3.5,
  [MT.OPERATOR_MEMORY]: 1.05,
};

function tokenize(query) {
  try {
    return String(query || "")
      .toLowerCase()
      .split(/[^a-z0-9_@.+-:]+/gi)
      .filter((x) => x && x.length > 1);
  } catch (_e) {
    return [];
  }
}

function countOccurrences(text, token) {
  try {
    if (!text || !token) return 0;
    const t = token.toLowerCase();
    let n = 0;
    let from = 0;
    while (true) {
      const i = text.indexOf(t, from);
      if (i === -1) break;
      n++;
      from = i + t.length;
    }
    return n;
  } catch (_e) {
    return 0;
  }
}

function recencyBoost(timestampIso, nowMs) {
  try {
    const ms = timestampIso ? Date.parse(String(timestampIso)) : NaN;
    const t = Number.isFinite(ms) ? ms : nowMs;
    const ageMs = Math.max(0, nowMs - t);
    return Math.pow(2, -(ageMs / RECENCY_HALF_LIFE_MS));
  } catch (_e) {
    return 0;
  }
}

function typeWeight(memoryType) {
  const base = MEMORY_TYPE_WEIGHT[memoryType];
  return typeof base === "number" && Number.isFinite(base) ? base : 1;
}

function entityExactBoost(frag, queryLc) {
  try {
    if (!queryLc.trim()) return 0;
    let b = 0;
    const eid = frag && frag.entityId != null ? String(frag.entityId).toLowerCase() : "";
    if (eid && (eid === queryLc || queryLc.includes(eid) || eid.includes(queryLc))) b += 8;
    const etype = frag && frag.entityType != null ? String(frag.entityType).toLowerCase() : "";
    if (etype === "customer" && eid && queryLc.includes(eid)) b += 3;
    return b;
  } catch (_e) {
    return 0;
  }
}

/**
 * Assigns deterministic `scoreDetail` onto each shallow copy fragment.
 *
 * @param {object[]} results — memory fragments (plain objs)
 * @param {string} queryRaw
 */
function rankMemoryResults(results, queryRaw) {
  try {
    const queryLc = String(queryRaw || "").toLowerCase().trim();
    const tokens = tokenize(queryRaw);
    const nowMs = Date.now();

    return (Array.isArray(results) ? results : []).map((r) => {
      const hay = `${r.searchableText || ""} ${r.summary || ""}`;
      let kwFreq = 0;
      tokens.forEach((tok) => {
        kwFreq += countOccurrences(hay, tok);
      });

      const summaryMatch =
        typeof r.summary === "string" && queryLc.length > 0 && r.summary.toLowerCase().includes(queryLc) ? 10 : 0;

      let exactEntity = entityExactBoost(r, queryLc);
      /** token-level entity hit */
      if (!exactEntity && tokens.length) tokens.forEach((t) => (exactEntity += entityExactBoost(r, t)));

      const recency = recencyBoost(r.timestamp, nowMs);
      const typeW = typeWeight(r.memoryType);

      const score =
        typeW +
        exactEntity * 3 +
        kwFreq * 5 +
        summaryMatch +
        recency * 120;

      return Object.assign({}, r, {
        score,
        scoreDetail: {
          typeWeight: typeW,
          entityBoost: exactEntity,
          kwFrequency: kwFreq,
          summaryMatch,
          recencyBoost: recency,
        },
      });
    });
  } catch (_e) {
    return [];
  }
}

module.exports = {
  rankMemoryResults,
  tokenize,
};
