const express = require("express");
const router = express.Router();

let appendDailyEvent;
try { appendDailyEvent = require("../scripts/memory/appendDailyEvent"); } catch (e) {}
let extractTasks;
try { extractTasks = require("../scripts/memory/extractTasks"); } catch (e) {}
let upsertEntity;
try { upsertEntity = require("../scripts/memory/upsertEntity"); } catch (e) {}
let generateTaskViews;
try { generateTaskViews = require("../scripts/memory/generateTaskViews"); } catch (e) {}
let generateRevenueIntel;
try { generateRevenueIntel = require("../scripts/memory/generateRevenueIntel"); } catch (e) {}
let generateFollowups;
try { generateFollowups = require("../scripts/memory/generateFollowups"); } catch (e) {}
let generateReactivation;
try { generateReactivation = require("../scripts/memory/generateReactivation"); } catch (e) {}
let generateDepositPush;
try { generateDepositPush = require("../scripts/memory/generateDepositPush"); } catch (e) {}
let processIntake;
try { processIntake = require("../scripts/memory/processIntake"); } catch (e) {}
let runOperator;
try { runOperator = require("../scripts/memory/runOperator"); } catch (e) {}
let runDailyCycle;
try { runDailyCycle = require("../scripts/memory/runDailyCycle"); } catch (e) {}
let generateCashIntel;
try { generateCashIntel = require("../scripts/memory/generateCashIntel"); } catch (e) {}
let generateCollections;
try { generateCollections = require("../scripts/memory/generateCollections"); } catch (e) {}

function missing(res) {
  return res.status(500).json({ ok: false, result: {}, error: "Module not available" });
}

router.post("/intake", (req, res) => {
  if (!processIntake) return missing(res);
  try {
    const rawText = String(req.body?.rawText || "");
    const result = processIntake(rawText, req.body?.options || {});
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/task", (req, res) => {
  if (!extractTasks) return missing(res);
  try {
    const rawText = String(req.body?.rawText || "");
    const result = extractTasks(rawText);
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/entity", (req, res) => {
  if (!upsertEntity) return missing(res);
  try {
    const result = upsertEntity(req.body || {});
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/event", (req, res) => {
  if (!appendDailyEvent) return missing(res);
  try {
    const result = appendDailyEvent(req.body || {});
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/tasks/refresh", (_req, res) => {
  if (!generateTaskViews) return missing(res);
  try {
    const result = generateTaskViews();
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/intel/refresh", (_req, res) => {
  if (!generateRevenueIntel) return missing(res);
  try {
    const result = generateRevenueIntel();
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/run-daily", (_req, res) => {
  if (!generateTaskViews || !generateRevenueIntel || !generateFollowups || !generateReactivation || !generateDepositPush) {
    return missing(res);
  }
  try {
    const result = {
      taskViews: generateTaskViews(),
      intel: generateRevenueIntel(),
      followups: generateFollowups(),
      reactivation: generateReactivation(),
      deposits: generateDepositPush()
    };
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/operator/run", (_req, res) => {
  if (
    !generateTaskViews ||
    !generateRevenueIntel ||
    !generateCashIntel ||
    !generateCollections ||
    !generateFollowups ||
    !generateReactivation ||
    !generateDepositPush ||
    !runOperator
  ) {
    return missing(res);
  }
  try {
    generateTaskViews();
    generateRevenueIntel();
    generateCashIntel();
    generateCollections();
    generateFollowups();
    generateReactivation();
    generateDepositPush();
    const operator = runOperator();
    return res.json({
      ok: true,
      actions: operator.actions,
      report: operator.reportPath
    });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/cash/refresh", (_req, res) => {
  if (!generateCashIntel || !generateCollections) return missing(res);
  try {
    const cash = generateCashIntel();
    const collections = generateCollections();
    return res.json({
      ok: true,
      cashRisks: cash.cashRisks || 0,
      collections: collections.collections || 0
    });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

router.post("/run-cycle", (_req, res) => {
  if (!runDailyCycle) return missing(res);
  try {
    const result = runDailyCycle();
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, result: {}, error: e.message || "error" });
  }
});

module.exports = router;
