"use strict";

const getSummary = require("./summary");

let lastRun = null;

module.exports = async function proactiveEngine() {
  try {
    const now = new Date();

    // Prevent spam (run max every 5 minutes)
    if (lastRun && now - lastRun < 5 * 60 * 1000) {
      return;
    }

    lastRun = now;

    const data = await getSummary();

    if (!data || !data.success) {
      console.log("[Proactive] No data available");
      return;
    }

    console.log("==============================");
    console.log("[Proactive Engine Run]");
    console.log(new Date().toISOString());

    // ALERTS
    if (data.alerts && data.alerts.length > 0) {
      data.alerts.forEach((alert) => {
        try {
          console.log("[ALERT]", alert && alert.message ? alert.message : "Unknown alert");
        } catch (_) {}
      });
    }

    // PRINTING STALL DETECTION
    if (data.queues && data.queues.productionReady && data.queues.productionReady.length > 5) {
      console.log("[ALERT] Too many jobs sitting in Production Ready");
    }

    // EMPTY PIPELINE DETECTION
    if (((data.metrics && data.metrics.ordersToday) || 0) === 0) {
      console.log("[ALERT] No orders today — sales problem");
    }

    console.log("==============================");
  } catch (err) {
    console.log("[Proactive ERROR]", err && err.message ? err.message : String(err));
  }
};
