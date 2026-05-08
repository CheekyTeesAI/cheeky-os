"use strict";

const memorySearch = require("../memory/memorySearch");

const semanticTaskEngine = require("../memory/semanticTaskEngine");


function previewsFrom(searchResult) {
  /** @type {object[]} */
  const out = [];
  (searchResult.results || []).forEach((hit) => {
    /** @type {any} */
    const row = hit && hit.row ? hit.row : hit;
    if (!row) return;
    out.push({
      summary: row.summary,
      outcome: row.outcome,
      tags: row.tags,
      taskId: row.taskId,
    });
  });
  return out;
}

function retrieveArchitectureDecisions() {
  try {
    const r = memorySearch.search({ outcome: "completed", query: "architecture" });
    return { readonly: true, previews: previewsFrom(r) };
  } catch (_e) {
    return { readonly: true, previews: [] };
  }
}

function priorFailures(filters) {
  try {
    return memorySearch.search({ outcome: "failed", query: filters && filters.query });
  } catch (_e) {
    return { success: false, results: [] };
  }
}

function similarBuild(targetHint) {
  try {
    const q = targetHint ? String(targetHint) : "build";
    const r = memorySearch.search({ query: q, outcome: "completed" });
    return { success: r.success, previews: previewsFrom(r) };
  } catch (_e) {
    return { success: false, previews: [] };
  }
}

function similarViaSemantic(hint) {
  try {
    return semanticTaskEngine.findRelatedTasks(hint || {}, 8);
  } catch (_e) {
    return { success: false, related: [] };
  }
}

module.exports = {
  retrieveArchitectureDecisions,
  priorFailures,
  similarBuild,
  similarViaSemantic,
};
