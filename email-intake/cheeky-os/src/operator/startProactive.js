"use strict";

const proactiveEngine = require("./proactiveEngine");

module.exports = function startProactive() {
  try {
    if (String(process.env.ENABLE_PROACTIVE || "false").toLowerCase() !== "true") {
      console.log("[Proactive] Disabled (ENABLE_PROACTIVE!=true)");
      return;
    }
    console.log("[Proactive] Engine starting...");

    setInterval(async () => {
      try {
        await proactiveEngine();
      } catch (err) {
        console.log("[Proactive LOOP ERROR]", err && err.message ? err.message : String(err));
      }
    }, 60 * 1000); // runs every 60 seconds
  } catch (err) {
    console.log("[Proactive START ERROR]", err && err.message ? err.message : String(err));
  }
};
