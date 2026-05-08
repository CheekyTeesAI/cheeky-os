"use strict";

/**
 * Optional 6:30-style digest run — opt-in via CHEEKY_DAILY_DIGEST_ENABLED=true.
 * One generation per America/New_York calendar day (idempotent via store).
 */

const store = require("./dailyDigests.store");
const { generateAndStoreDailyDigest } = require("./dailyDigest.service");

/** @type {ReturnType<typeof setInterval>|null} */
let intervalRef = null;
/** @type {string|null} */
let lastFiredDateKey = null;

function truthy(k) {
  return String(process.env[k] || "")
    .trim()
    .toLowerCase() === "true";
}

/**
 * Minutes from midnight in America/New_York (0–1439).
 */
function nyMinutesFromMidnight(d) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  let hh = 0;
  let mm = 0;
  for (const p of parts) {
    if (p.type === "hour") hh = parseInt(p.value, 10) || 0;
    if (p.type === "minute") mm = parseInt(p.value, 10) || 0;
  }
  return hh * 60 + mm;
}

function startDailyDigestScheduler() {
  if (intervalRef) return;
  if (!truthy("CHEEKY_DAILY_DIGEST_ENABLED")) {
    console.log("[digest-scheduler] off — set CHEEKY_DAILY_DIGEST_ENABLED=true to enable");
    return;
  }
  const hour = Math.min(23, Math.max(0, parseInt(String(process.env.CHEEKY_DAILY_DIGEST_HOUR || "6"), 10) || 6));
  const minute = Math.min(59, Math.max(0, parseInt(String(process.env.CHEEKY_DAILY_DIGEST_MINUTE || "30"), 10) || 30));
  const target = hour * 60 + minute;
  console.log(
    `[digest-scheduler] on — America/New_York ${hour}:${String(minute).padStart(2, "0")} · tick 5m · auto_send=${truthy("CHEEKY_DAILY_DIGEST_AUTO_SEND") ? "true" : "false"}`
  );

  intervalRef = setInterval(async () => {
    try {
      const key = store.digestDateKeyNY();
      if (lastFiredDateKey === key) return;
      if (store.getByDigestDate(key)) {
        lastFiredDateKey = key;
        return;
      }
      const nowM = nyMinutesFromMidnight(new Date());
      if (nowM < target) return;
      await generateAndStoreDailyDigest({ persist: true, refreshAi: false });
      lastFiredDateKey = key;
    } catch (e) {
      console.warn("[digest-scheduler]", e && e.message ? e.message : e);
    }
  }, 5 * 60 * 1000);
}

module.exports = { startDailyDigestScheduler };
