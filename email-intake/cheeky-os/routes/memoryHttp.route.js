"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();

const memoryRouterFacade = require(path.join(__dirname, "..", "..", "src", "memory", "memoryRouter"));
const memoryIndexer = require(path.join(__dirname, "..", "..", "src", "memory", "memoryIndexer"));
const memorySearch = require(path.join(__dirname, "..", "..", "src", "memory", "memorySearch"));

router.get("/search", (req, res) => {
  try {
    const q = req.query && req.query.q != null ? String(req.query.q) : "";
    const lim = req.query && req.query.limit != null ? Number(req.query.limit) : undefined;
    const payload = memoryRouterFacade.searchBridgeMemory(q, { limit: lim });
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(200).json({ ok: false, query: "", totalResults: 0, results: [], error: String(e.message || e) });
  }
});

router.get("/customer", (req, res) => {
  try {
    const customer =
      req.query && req.query.customer != null ? String(req.query.customer) : String(req.query.c || "");
    const payload = memorySearch.searchCustomerMemory(customer.trim());
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(200).json({
      ok: false,
      query: "",
      totalResults: 0,
      results: [],
      error: String(e && e.message ? e.message : e),
    });
  }
});

router.get("/timeline", (req, res) => {
  try {
    const entityType =
      req.query && req.query.entityType != null ? String(req.query.entityType) : "";
    const entityId =
      req.query && req.query.entityId != null ? String(req.query.entityId) : "";
    const customer =
      req.query && req.query.customer != null ? String(req.query.customer) : "";

    const payload =
      memoryRouterFacade.getMemoryTimeline({
        entityType,
        entityId,
        customer: customer.trim() || undefined,
      }) || {};

    return res.status(200).json(payload);
  } catch (e) {
    return res.status(200).json({
      ok: false,
      entries: [],
      groups: [],
      error: String(e && e.message ? e.message : e),
    });
  }
});

router.get("/stats", (_req, res) => {
  try {
    const stats =
      typeof memoryIndexer.getMemoryIndexStats === "function" ? memoryIndexer.getMemoryIndexStats() : {};

    const eventPersistence = require(path.join(__dirname, "..", "..", "src", "bridge", "persistence", "eventPersistence"));

    let psBundle = {};

    try {
      const ps = eventPersistence.getPersistenceStats();
      psBundle =
        typeof ps.persistedEvents === "number"
          ? {
              persistedEvents: ps.persistedEvents,
              storageFileSizeBytes: ps.storageFileSizeBytes || 0,
              storagePath: ps.storagePath,
              malformedLinesSkipped: ps.malformedLinesSkipped || 0,
            }
          : {};
    } catch (_eBp) {}

    return res.status(200).json({
      ok: true,
      semanticIndex: stats,
      bridgePersistence: psBundle,
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
      semanticIndex: {},
      bridgePersistence: {},
    });
  }
});

router.post("/rebuild-indexes", (_req, res) => {
  try {
    const out = memoryRouterFacade.rebuildMemoryIndexes();
    return res.status(200).json(Object.assign({ ok: true }, out));
  } catch (e2) {
    return res.status(200).json({ ok: false, error: String(e2 && e2.message ? e2.message : e2) });
  }
});

module.exports = router;
