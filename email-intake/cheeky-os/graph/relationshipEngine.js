"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const GRAPH_FILE = path.join(taskQueue.DATA_DIR, "operational-graph-state.json");

function emptyGraph() {
  return {
    version: 1,
    entities: {},
    edges: [],
  };
}

function readGraphSafe() {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(GRAPH_FILE)) return emptyGraph();
    const j = JSON.parse(fs.readFileSync(GRAPH_FILE, "utf8"));
    if (!j || typeof j !== "object") return emptyGraph();
    return Object.assign(emptyGraph(), j, {
      entities: typeof j.entities === "object" && j.entities ? j.entities : {},
      edges: Array.isArray(j.edges) ? j.edges : [],
    });
  } catch (_e) {
    return emptyGraph();
  }
}

function writeGraph(g) {
  try {
    taskQueue.ensureDirAndFiles();
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(g, null, 2), "utf8");
  } catch (_e) {}
}

/**
 * Upsert entity metadata shard (additive fields only when merge).
 *
 * @param {{ id:string, entityType:string, attrs?:object }} spec
 */
function registerEntity(spec) {
  try {
    const id = String((spec && spec.id) || "");
    const entityType = String((spec && spec.entityType) || "");
    if (!id || !entityType) return { ok: false, error: "missing_id_or_type" };
    const g = readGraphSafe();
    const prev = g.entities[id] && typeof g.entities[id] === "object" ? g.entities[id] : {};
    g.entities[id] = Object.assign({}, prev, { id, entityType }, spec.attrs && typeof spec.attrs === "object" ? spec.attrs : {});
    writeGraph(g);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * @param {{ fromId:string, toId:string, rel:string }} spec
 */
function addRelationship(spec) {
  try {
    const fromId = String((spec && spec.fromId) || "");
    const toId = String((spec && spec.toId) || "");
    const rel = String((spec && spec.rel) || "").toUpperCase();
    if (!fromId || !toId || !rel) return { ok: false, error: "missing_from_to_rel" };

    const g = readGraphSafe();
    /** @type {object[]} */
    const edges = g.edges || [];

    /** @typedef {{ fromId:string, toId:string, rel:string, ts:string }} Edge */
    const dup = edges.some((e) => e && e.fromId === fromId && e.toId === toId && e.rel === rel);
    const edge = { fromId, toId, rel, ts: new Date().toISOString() };
    if (!dup) edges.push(edge);
    g.edges = edges;

    /** ensure nodes exist minimally */
    g.entities[fromId] = Object.assign({}, g.entities[fromId] || { id: fromId });
    g.entities[toId] = Object.assign({}, g.entities[toId] || { id: toId });

    writeGraph(g);
    return { ok: true, duplicate: dup };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = {
  GRAPH_FILE,
  readGraphSafe,
  registerEntity,
  addRelationship,
};
