"use strict";

const autoPilotEngine = require("./autoPilotEngine");

module.exports = function startAutoPilot() {
  try {
    if (String(process.env.AUTOPILOT || "false").toLowerCase() !== "true") {
      console.log("[AUTOPILOT] Disabled (AUTOPILOT!=true)");
      return;
    }
    console.log("[AUTOPILOT] Engine initialized");

    setInterval(async () => {
      try {
        await autoPilotEngine();
      } catch (err) {
        console.log("[AUTOPILOT LOOP ERROR]", err && err.message ? err.message : String(err));
      }
    }, 2 * 60 * 1000); // every 2 minutes
  } catch (err) {
    console.log("[AUTOPILOT START ERROR]", err && err.message ? err.message : String(err));
  }
};
