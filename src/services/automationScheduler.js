/**
 * Cron schedules for background automation — opt-in via AUTOMATION_CRON_ENABLED=true
 */
const path = require("path");

let started = false;
let cronModule = null;

function resolveRunner() {
  return require(path.join(__dirname, "automationRunner"));
}

function safeSchedule(cron, expr, fn) {
  try {
    return cron.schedule(expr, () => {
      Promise.resolve(fn()).catch((e) => console.warn("[automationScheduler] task error:", e && e.message ? e.message : e));
    });
  } catch (e) {
    console.warn("[automationScheduler] schedule failed:", e && e.message ? e.message : e);
    return null;
  }
}

/**
 * @returns {{ started: boolean, reason?: string }}
 */
function startAutomationScheduler() {
  if (started) return { started: true, reason: "already_started" };
  // Dual gate: daily scheduler flag + explicit cron opt-in (additive safety).
  if (String(process.env.DAILY_SCHEDULER || "").toLowerCase() !== "true") {
    return { started: false, reason: "set_DAILY_SCHEDULER=true" };
  }
  if (String(process.env.AUTOMATION_CRON_ENABLED || "").toLowerCase() !== "true") {
    return { started: false, reason: "set_AUTOMATION_CRON_ENABLED=true" };
  }
  try {
    cronModule = require("node-cron");
  } catch (_e) {
    return { started: false, reason: "node_cron_missing" };
  }

  const { runAutomationCycle } = resolveRunner();

  safeSchedule(cronModule, "*/5 * * * *", () =>
    runAutomationCycle({
      only: ["intake", "customerMatch", "customerService"],
      label: "tick_5m",
    })
  );

  safeSchedule(cronModule, "*/15 * * * *", () =>
    runAutomationCycle({
      only: ["jobs", "production"],
      label: "tick_15m",
    })
  );

  safeSchedule(cronModule, "*/30 * * * *", () =>
    runAutomationCycle({
      only: ["scheduling"],
      label: "tick_30m",
    })
  );

  safeSchedule(cronModule, "0 * * * *", () =>
    runAutomationCycle({
      only: ["jobs", "purchasing", "vendorPreview", "communications"],
      label: "tick_hourly",
    })
  );

  safeSchedule(cronModule, "0 */2 * * *", () =>
    runAutomationCycle({
      only: ["square"],
      label: "tick_2h_square",
    })
  );

  safeSchedule(cronModule, "15 2 * * *", () =>
    runAutomationCycle({
      label: "nightly_full",
    })
  );

  started = true;
  console.log("[automationScheduler] cron jobs registered (AUTOMATION_CRON_ENABLED=true)");
  return { started: true };
}

function getSchedulerStatus() {
  return {
    dailySchedulerEnv: String(process.env.DAILY_SCHEDULER || "").toLowerCase() === "true",
    cronEnvEnabled: String(process.env.AUTOMATION_CRON_ENABLED || "").toLowerCase() === "true",
    started,
  };
}

module.exports = {
  startAutomationScheduler,
  getSchedulerStatus,
};
