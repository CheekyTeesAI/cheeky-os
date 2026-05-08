"use strict";

const express = require("express");
const timeClock = require("../services/timeClock.store");

const router = express.Router();

router.post("/clock-in", express.json(), (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const r = timeClock.clockIn({
      employeeName: body.employeeName,
      category: body.category,
      orderId: body.orderId,
      note: body.note,
    });
    if (!r.ok) {
      return res.status(r.error === "already_clocked_in" ? 409 : 400).json({
        ok: false,
        error: r.error,
        entry: r.entry,
      });
    }
    return res.json({ ok: true, entry: r.entry });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

router.post("/clock-out", express.json(), (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const r = timeClock.clockOut({
      employeeName: body.employeeName,
      note: body.note,
    });
    if (!r.ok) {
      const code = r.error === "no_active_clock_in" ? 404 : 400;
      return res.status(code).json({ ok: false, error: r.error });
    }
    return res.json({ ok: true, entry: r.entry, minutes: r.minutes });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

router.get("/status", (req, res) => {
  try {
    const name = (req.query && req.query.employeeName) || "";
    const r = timeClock.getStatus(String(name));
    return res.json(r);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

router.get("/today", (req, res) => {
  try {
    const name = (req.query && req.query.employeeName) || "";
    const r = timeClock.getTodaySummary(String(name));
    return res.json(r);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

module.exports = router;
