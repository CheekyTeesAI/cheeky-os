"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();
const store = require(path.join(__dirname, "..", "services", "cashflow.store"));
const sentinel = require(path.join(__dirname, "..", "services", "cashflowSentinel.service"));

router.get("/snapshot", (_req, res) => {
  try {
    const snap = sentinel.buildCashflowSnapshot();
    return res.status(200).json(snap);
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/obligations", (_req, res) => {
  try {
    const rows = store.listObligationsWithDerived();
    return res.status(200).json({ ok: true, obligations: rows, count: rows.length });
  } catch (e) {
    return res.status(200).json({ ok: false, obligations: [], error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/obligations", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!String(body.name || "").trim()) {
      return res.status(200).json({ ok: false, error: "name_required" });
    }
    if (!String(body.dueDate || "").trim()) {
      return res.status(200).json({ ok: false, error: "dueDate_required" });
    }
    const row = store.addObligation(body);
    console.log("[cashflow] obligation added", row.id);
    return res.status(200).json({ ok: true, obligation: row });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.patch("/obligations/:id/status", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = store.patchObligationStatus(id, body);
    if (!out) return res.status(200).json({ ok: false, error: "not_found" });
    if (out.error) return res.status(200).json({ ok: false, error: out.error });
    console.log("[cashflow] obligation status", id, body.status);
    return res.status(200).json({ ok: true, obligation: out });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/events", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!String(body.expectedDate || "").trim()) {
      return res.status(200).json({ ok: false, error: "expectedDate_required" });
    }
    const row = store.addEvent(body);
    console.log("[cashflow] event added", row.id);
    return res.status(200).json({ ok: true, event: row });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

/** Manual cash on hand — one primary account upsert from UI */
router.post("/accounts/primary", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const balance = Math.round(Number(body.currentBalance || 0));
    const row = store.upsertCashAccount({
      id: "primary-operating",
      name: String(body.name || "Primary operating"),
      type: String(body.type || "CHECKING"),
      currentBalance: balance,
      notes: String(body.notes || ""),
    });
    return res.status(200).json({ ok: true, account: row });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/debts", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!String(body.name || "").trim()) {
      return res.status(200).json({ ok: false, error: "name_required" });
    }
    const row = store.addDebt(body);
    return res.status(200).json({ ok: true, debt: row });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

module.exports = router;
