"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();
const store = require(path.join(__dirname, "..", "services", "dailyDigests.store"));
const svc = require(path.join(__dirname, "..", "services", "dailyDigest.service"));

router.get("/today", async (_req, res) => {
  try {
    const key = store.digestDateKeyNY();
    let e = store.getByDigestDate(key);
    if (!e) e = store.getLatestAny();
    if (!e) {
      return res.status(200).json({
        ok: true,
        date: key,
        digest: null,
        message: "no_digest_stored",
        timestamp: new Date().toISOString(),
      });
    }
    return res.status(200).json({
      ok: true,
      date: e.digestDate,
      digest: e.payloadJson,
      stored: {
        id: e.id,
        createdAt: e.createdAt,
        mode: e.mode,
        sentAt: e.sentAt,
        topPriorityCount: e.topPriorityCount,
        riskCount: e.riskCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/generate", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const persist = body.persist !== false;
    const refreshAi = body.refreshAi === true;
    const out = await svc.generateAndStoreDailyDigest({ persist, refreshAi });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.get("/history", (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || "20"), 10) || 20));
    const rows = store.listRecent(limit).map((r) => ({
      id: r.id,
      digestDate: r.digestDate,
      headline: r.headline,
      createdAt: r.createdAt,
      mode: r.mode,
      sentAt: r.sentAt,
      topPriorityCount: r.topPriorityCount,
      riskCount: r.riskCount,
    }));
    return res.status(200).json({ ok: true, entries: rows, timestamp: new Date().toISOString() });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      entries: [],
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

module.exports = router;
