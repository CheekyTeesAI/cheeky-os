"use strict";

const getSummary = require("./summary");
const buildPriorities = require("./priorityEngine");
const taskAdvance = require("../actions/taskAdvanceAction");
const assignTask = require("../actions/assignTaskAction");

module.exports = async function autoPilotEngine() {
  try {
    const AUTOPILOT = process.env.AUTOPILOT === "true";

    if (!AUTOPILOT) {
      console.log("[AUTOPILOT OFF]");
      return;
    }

    console.log("==============================");
    console.log("[AUTOPILOT RUNNING]");
    console.log(new Date().toISOString());

    const data = await getSummary();
    const priorities = buildPriorities(data || {});

    for (const p of priorities) {
      try {
        // HANDLE PRODUCTION READY -> START PRINTING
        if (p && p.action === "START_PRINTING") {
          const jobs = (data && data.queues && data.queues.productionReady) || [];

          for (const job of jobs.slice(0, 2)) {
            try {
              await assignTask(job && job.id, "Jeremy");
              await taskAdvance(job && job.id);
              console.log("[AUTO] Started job:", job && job.id ? job.id : "unknown");
            } catch (err) {
              console.log("[AUTO] Failed job:", job && job.id ? job.id : "unknown", err && err.message ? err.message : String(err));
            }
          }
        }

        // HANDLE OVERDUE
        if (p && p.action === "HANDLE_OVERDUE") {
          console.log("[AUTO] Overdue tasks detected — manual review recommended");
        }
      } catch (err) {
        console.log("[AUTOPILOT PRIORITY ERROR]", err && err.message ? err.message : String(err));
      }
    }

    console.log("==============================");
  } catch (err) {
    console.log("[AUTOPILOT ERROR]", err && err.message ? err.message : String(err));
  }
};
