"use strict";

const express = require("express");
const path = require("path");

const bridgeRouter = require(path.join(__dirname, "..", "..", "src", "bridge", "bridgeRouter"));
const eventStore = require(path.join(__dirname, "..", "..", "src", "bridge", "eventStore"));
const eventPersistence = require(path.join(__dirname, "..", "..", "src", "bridge", "persistence", "eventPersistence"));
const eventReplay = require(path.join(__dirname, "..", "..", "src", "bridge", "persistence", "eventReplay"));

const router = express.Router();

router.get("/events/recent", (_req, res) => {
  try {
    const lim = _req.query && _req.query.limit != null ? _req.query.limit : 10;
    const payload = bridgeRouter.getRecentBridgeEvents({ limit: lim });
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(200).json({ ok: false, events: [], error: e && e.message ? e.message : String(e) });
  }
});

router.get("/customer-context", (_req, res) => {
  try {
    const cust = _req.query && _req.query.customer != null ? String(_req.query.customer) : "";
    const payload = bridgeRouter.buildBridgeCustomerContext({ customer: cust });
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(200).json({
      ok: false,
      customerIdentifier: "",
      matchedEventCount: 0,
      events: [],
      summary: "REQUEST_ERROR",
      error: e && e.message ? e.message : String(e),
    });
  }
});

router.get("/persistence/stats", (_req, res) => {
  try {
    const inMemoryEvents = typeof eventStore.getInMemoryCount === "function" ? eventStore.getInMemoryCount() : 0;
    const ps = eventPersistence.getPersistenceStats();
    const replayStats = eventReplay.getLastReplayStats();

    const persistedEvents = typeof ps.persistedEvents === "number" ? ps.persistedEvents : 0;

    return res.status(200).json({
      inMemoryEvents,
      persistedEvents,
      replayStats,
      storageFileSizeBytes: ps.storageFileSizeBytes != null ? ps.storageFileSizeBytes : 0,
      storagePath: ps.storagePath || eventPersistence.STORAGE_FILE || "",
      malformedLinesSkippedOnLoad:
        typeof ps.malformedLinesSkipped === "number" ? ps.malformedLinesSkipped : undefined,
      persistenceLoadError: ps.loadError || undefined,
    });
  } catch (e) {
    return res.status(200).json({
      inMemoryEvents: 0,
      persistedEvents: 0,
      replayStats: { replayed: 0, skipped: 0, failed: 0 },
      storageFileSizeBytes: 0,
      storagePath: "",
      error: e && e.message ? e.message : String(e),
    });
  }
});

router.post("/events/test", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" && req.body !== null ? req.body : {};
    const event = {
      type: body.type != null ? String(body.type) : "EMAIL_SEARCH_REQUESTED",
      source: body.source != null ? String(body.source) : "bridge-http-test",
      entityType: body.entityType !== undefined ? body.entityType : null,
      entityId: body.entityId !== undefined ? body.entityId : null,
      actor: body.actor != null ? String(body.actor) : "manual-test",
      payload: body.payload !== undefined ? body.payload : { note: "bridge_test_endpoint" },
      metadata: Object.assign(
        { route: "POST /api/bridge/events/test" },
        body.metadata && typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {}
      ),
    };
    const r = bridgeRouter.recordBridgeEvent(event);
    return res.status(r.ok ? 200 : 500).json(r);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

module.exports = router;
