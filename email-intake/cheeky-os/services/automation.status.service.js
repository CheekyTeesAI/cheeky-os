"use strict";

/**
 * Read-only visibility for timers (no new intervals started here).
 */

function safeRequire(p) {
  try {
    return require(p);
  } catch (_) {
    return null;
  }
}

function getAutomationStatus() {
  const dailySchedulerEnabled = process.env.DAILY_SCHEDULER !== "false";

  let autoCash = { available: false };
  const dailyMod = safeRequire("./daily.cash.runner");
  if (dailyMod && typeof dailyMod.getStatus === "function") {
    try {
      autoCash = { available: true, ...dailyMod.getStatus() };
    } catch (e) {
      autoCash = { available: false, error: e && e.message ? e.message : String(e) };
    }
  }

  let activation = { available: false };
  const actPath = require("path").join(__dirname, "..", "..", "activation", "activation.runner");
  const actMod = safeRequire(actPath);
  if (actMod && typeof actMod.getRunnerStatus === "function") {
    try {
      activation = { available: true, ...actMod.getRunnerStatus() };
    } catch (e) {
      activation = { available: false, error: e && e.message ? e.message : String(e) };
    }
  }

  const timers = [];
  if (dailySchedulerEnabled && autoCash.available) {
    const ih = typeof autoCash.intervalHours === "number" ? autoCash.intervalHours : 24;
    timers.push({ name: "dailyCash", intervalHours: ih });
  }
  if (activation.available && activation.started) {
    timers.push({ name: "activationProduction", intervalMinutes: activation.runIntervalMinutes || 10 });
  }

  let lastKnownRun = null;
  if (autoCash.lastRunAt) lastKnownRun = autoCash.lastRunAt;
  if (activation.lastRunAt && (!lastKnownRun || activation.lastRunAt > lastKnownRun)) {
    lastKnownRun = activation.lastRunAt;
  }

  return {
    dailySchedulerEnabled,
    autoCashRunnerAvailable: autoCash.available,
    activationRunnerAvailable: activation.available,
    lastKnownRun,
    timers,
    autoCash,
    activation,
  };
}

module.exports = { getAutomationStatus };
