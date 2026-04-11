"use strict";

const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

require("../lib/config");
const { getTasks } = require("../lib/taskStore");
const { getStuckTasks } = require("../lib/stuckMonitor");
const { sendStuckTaskNotification } = require("../lib/notifyEngine");
const { logEvent } = require("../lib/eventStore");

(async function main() {
  try {
    const tasks = getTasks();
    const stuck = getStuckTasks(tasks);
    console.log(stuck.length + " stuck tasks found");

    for (const t of stuck) {
      console.log(
        "🚨 stuck task detected:",
        String(t.stage),
        "—",
        String(t.title || ""),
        "(age " + Number(t.ageHours || 0).toFixed(1) + "h)"
      );
      try {
        logEvent("stuck_task_detected", {
          taskId: t.id,
          stage: t.stage,
          ageHours: t.ageHours,
          thresholdHours: t.thresholdHours,
        });
      } catch (_) {}
      const r = await sendStuckTaskNotification(t);
      if (r && r.success) {
        console.log("   alert sent for", String(t.stage), "—", String(t.title || ""));
      }
    }

    if (stuck.length === 0) {
      console.log("No stuck tasks — all clear.");
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("checkStuckTasks failed:", err.message);
    process.exitCode = 1;
  }
})();
