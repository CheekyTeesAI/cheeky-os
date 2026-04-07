/**
 * Bundle 20 — in-process interval loop for system checks (no cron, no DB).
 */

const { runSystemCheck } = require("./systemCheckService");

const state = {
  isRunning: false,
  lastRun: null,
  intervalMs: 300000,
};

/** @type {ReturnType<typeof setInterval> | null} */
let timerId = null;

function tick() {
  runSystemCheck()
    .then((out) => {
      state.lastRun = out.timestamp || new Date().toISOString();
    })
    .catch(() => {
      state.lastRun = new Date().toISOString();
    });
}

function start() {
  if (state.isRunning) return;
  state.isRunning = true;
  tick();
  timerId = setInterval(tick, state.intervalMs);
}

function stop() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  state.isRunning = false;
}

function getStatus() {
  return {
    isRunning: state.isRunning,
    lastRun: state.lastRun || "",
    intervalMs: state.intervalMs,
  };
}

module.exports = { start, stop, getStatus };
