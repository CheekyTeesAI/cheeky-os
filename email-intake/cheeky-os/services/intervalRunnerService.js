/**
 * Bundle 20 — in-process interval loop for system checks (no cron, no DB).
 */

const { runSystemCheck } = require("./systemCheckService");
const { runFollowupExecutor } = require("./followupExecutorService");
const { runInvoiceExecutor } = require("./invoiceExecutorService");
const { runProductionExecutor } = require("./productionExecutorService");
const { canRun } = require("./autopilotGuardService");
const { addException } = require("./exceptionQueueService");

const state = {
  isRunning: false,
  lastRun: null,
  intervalMs: 300000,
};

/** @type {ReturnType<typeof setInterval> | null} */
let timerId = null;

function tick() {
  try {
    runSystemCheck()
      .then((out) => {
        state.lastRun = out.timestamp || new Date().toISOString();
        console.log("[intervalRunner] systemCheck", {
          lastRun: state.lastRun,
          shouldNotify: !!out.shouldNotify,
        });
      })
      .catch((err) => {
        console.error("[intervalRunner] systemCheck", err.message || err);
        state.lastRun = new Date().toISOString();
      })
      .then(() => runFollowupExecutor())
      .then((fx) => {
        console.log("[intervalRunner] followupExecutor", fx);
      })
      .catch((err) => {
        console.error("[intervalRunner] followupExecutor", err.message || err);
      })
      .then(() => {
        const g = canRun("invoice_create");
        if (!g.allowed) {
          console.warn("[intervalRunner] invoiceExecutor blocked:", g.reason);
          return { created: 0, skipped: 0, errors: [g.reason] };
        }
        return runInvoiceExecutor();
      })
      .then((ix) => {
        console.log("[intervalRunner] invoiceExecutor", ix);
      })
      .catch((err) => {
        console.error("[intervalRunner] invoiceExecutor", err.message || err);
      })
      .then(() => {
        const g = canRun("production_move");
        if (!g.allowed) {
          console.warn("[intervalRunner] productionExecutor blocked:", g.reason);
          return { advanced: 0, skipped: 0, errors: [g.reason] };
        }
        return runProductionExecutor();
      })
      .then((px) => {
        console.log("[intervalRunner] productionExecutor", px);
      })
      .catch((err) => {
        console.error("[intervalRunner] productionExecutor", err.message || err);
      });
  } catch (err) {
    console.error("[intervalRunner] tick", err.message || err);
  }
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
