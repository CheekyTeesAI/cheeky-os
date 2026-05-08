"use strict";

const relationshipEngine = require("./relationshipEngine");

/**
 * Neighborhood expansion (bidirectional traversal, bounded).
 *
 * @param {string} startId
 * @param {{
 *    maxDepth?: number,
 *    maxEdges?: number,
 *    relFilter?: string,
 * }} opts
 */
function edgeSig(e) {
  try {
    return `${String(e.rel)}|${String(e.fromId)}|${String(e.toId)}`;
  } catch (_e) {
    return "";
  }
}

function neighborhood(startId, opts) {
  try {
    const id = String(startId || "");
    if (!id) return { success: false, nodes: [], edges: [], depthUsed: 0 };

    const o = opts && typeof opts === "object" ? opts : {};
    const maxDepth = Math.min(8, Math.max(1, Number(o.maxDepth) || 3));
    const maxEdges = Math.min(2000, Math.max(10, Number(o.maxEdges) || 320));
    const relFilter = o.relFilter ? String(o.relFilter).toUpperCase() : "";

    const g = relationshipEngine.readGraphSafe();
    const allEdges = Array.isArray(g.edges) ? g.edges : [];

    /** @type {Set<string>} */
    const seenNodes = new Set([id]);

    /** @type {Set<string>} */
    let frontier = new Set([id]);

    /** @type {object[]} */
    const outEdges = [];

    /** @type {Set<string>} */
    const seenSig = new Set();

    let depthUsed = 0;

    for (let layer = 0; layer < maxDepth && outEdges.length < maxEdges; layer++) {

      depthUsed = layer + 1;

      /** @type {Set<string>} */

      const nextFrontier = new Set();

      frontier.forEach((nid) => {

        for (let i = 0; i < allEdges.length && outEdges.length < maxEdges; i++) {

          const e = allEdges[i];

          try {

            if (!e || !e.fromId || !e.toId) continue;

            if (relFilter && String(e.rel) !== relFilter) continue;

            let other = "";

            if (e.fromId === nid) {

              other = e.toId;

            } else if (e.toId === nid) {

              other = e.fromId;

            } else continue;


            const sig = edgeSig(e);

            if (!sig || seenSig.has(sig)) continue;

            seenSig.add(sig);

            outEdges.push({ fromId: e.fromId, toId: e.toId, rel: e.rel, ts: e.ts });

            seenNodes.add(other);

            nextFrontier.add(other);

          } catch (_e2) {}

        }

      });


      frontier = nextFrontier;

      if (!frontier.size) break;


    }

    const nodes = Array.from(seenNodes).slice(0, 480).map((n) => ({
      id: n,
      meta: g.entities[n] || { id: n },
    }));

    return { success: true, nodes, edges: outEdges.slice(0, maxEdges), depthUsed };
  } catch (_e) {
    return { success: false, nodes: [], edges: [], depthUsed: 0 };
  }
}

/**
 * Operational summary for dashboard-style surfaces.
 */

function dependencySummary(centerId, depth) {
  try {
    const n = neighborhood(centerId, { maxDepth: depth || 2, maxEdges: 180 });
    return {
      success: !!n.success,
      nodeCount: n.nodes.length,
      edgeCount: n.edges.length,
      sampleEdges: n.edges.slice(0, 12),
    };
  } catch (_e) {
    return { success: false, nodeCount: 0, edgeCount: 0, sampleEdges: [] };
  }
}

module.exports = {
  neighborhood,
  dependencySummary,
};
