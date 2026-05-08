"use strict";

/**
 * CHEEKY OS v4.0 — Graceful HTTP + worker shutdown on SIGINT/SIGTERM (Docker/PM2/Kubernetes).
 */

let _installed = false;
let _httpServer = null;

function gracefulShutdown(signal) {
  return () => {
    console.log(`\n[shutdown] Received ${signal} — draining…`);
    try {
      const sf = require("./selfFixService");
      if (typeof sf.stopSelfFixReconciliation === "function") sf.stopSelfFixReconciliation();
    } catch (_) {}
    try {
      const { stopOperatorAutonomousWorkerGraceful } = require("./operatorAutonomousWorker.service");
      stopOperatorAutonomousWorkerGraceful();
    } catch (_) {}

    const server = _httpServer;
    if (!server || typeof server.close !== "function") {
      console.log("[shutdown] No HTTP server ref — exiting");
      process.exit(0);
      return;
    }

    server.close((err) => {
      if (err) console.warn("[shutdown] HTTP close error:", err.message || err);
      else console.log("[shutdown] HTTP server closed cleanly");
      process.exit(0);
    });

    /** Force-exit if close hangs (e.g. dangling keep-alive). */
    setTimeout(() => {
      console.warn("[shutdown] Forced exit after 12s drain timeout");
      process.exit(1);
    }, 12000).unref();
  };
}

/** @param {import('http').Server} httpServer */
function installGracefulShutdown(httpServer) {
  if (_installed) return;
  _installed = true;
  _httpServer = httpServer;
  process.once("SIGINT", gracefulShutdown("SIGINT"));
  process.once("SIGTERM", gracefulShutdown("SIGTERM"));
}

module.exports = { installGracefulShutdown, gracefulShutdown };
