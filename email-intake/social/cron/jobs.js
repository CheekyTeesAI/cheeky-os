"use strict";

/**
 * v1.2 cadence: Sun generate, daily post window, Mon summary.
 */

const cron = require("node-cron");
const scheduler = require("../lib/scheduler");

function safe(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`[social cron] ${name} ok`);
    } catch (err) {
      console.warn(`[social cron] ${name} failed`, err);
    }
  };
}

function register() {
  if (process.env.SOCIAL_CRON_ENABLED === "false") {
    console.log("[social cron] disabled via SOCIAL_CRON_ENABLED=false");
    return;
  }

  cron.schedule("0 18 * * 0", safe("sunday_generate", scheduler.generateWeeklyPosts));

  cron.schedule("0 10 * * *", safe("daily_post", scheduler.postDueContent));

  cron.schedule("0 7 * * 1", safe("monday_summary", scheduler.weeklyReport));

  console.log("[social cron] schedules registered (Sun generate / daily post / Mon summary)");
}

module.exports = { register };
