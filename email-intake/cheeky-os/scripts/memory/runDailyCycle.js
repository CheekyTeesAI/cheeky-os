const generateTaskViews = require("./generateTaskViews");
const generateRevenueIntel = require("./generateRevenueIntel");
const generateCashIntel = require("./generateCashIntel");
const generateCollections = require("./generateCollections");
const generateFollowups = require("./generateFollowups");
const generateReactivation = require("./generateReactivation");
const generateDepositPush = require("./generateDepositPush");
const runOperator = require("./runOperator");
const generateMorningBrief = require("./generateMorningBrief");
const generateEveningWrap = require("./generateEveningWrap");

function runSafe(name, fn, ran, errors) {
  try {
    fn();
    ran.push(name);
  } catch (err) {
    errors.push({ step: name, error: err.message || "error" });
    console.error(`[CRON] ${name} failed:`, err.message || err);
  }
}

function runDailyCycle() {
  const ran = [];
  const errors = [];
  console.log("[CRON] Morning cycle started");
  runSafe("generateTaskViews", generateTaskViews, ran, errors);
  runSafe("generateRevenueIntel", generateRevenueIntel, ran, errors);
  runSafe("generateCashIntel", generateCashIntel, ran, errors);
  runSafe("generateCollections", generateCollections, ran, errors);
  runSafe("generateFollowups", generateFollowups, ran, errors);
  runSafe("generateReactivation", generateReactivation, ran, errors);
  runSafe("generateDepositPush", generateDepositPush, ran, errors);
  runSafe("runOperator", runOperator, ran, errors);
  runSafe("generateMorningBrief", generateMorningBrief, ran, errors);
  return { ok: true, ran, errors };
}

function startDailyRhythm() {
  let cron = null;
  try {
    cron = require("node-cron");
  } catch (_) {}

  if (cron && typeof cron.schedule === "function") {
    cron.schedule("30 7 * * *", () => {
      runDailyCycle();
    });
    cron.schedule("30 18 * * *", () => {
      try {
        generateEveningWrap();
        console.log("[CRON] Evening wrap generated");
      } catch (err) {
        console.error("[CRON] Evening wrap failed:", err.message || err);
      }
    });
    console.log("[CRON] Daily rhythm scheduled with node-cron");
    return { ok: true, mode: "node-cron" };
  }

  let lastMorningRun = "";
  let lastEveningRun = "";
  setInterval(() => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const hour = now.getHours();
    const minute = now.getMinutes();

    if (hour === 7 && minute === 30 && lastMorningRun !== day) {
      lastMorningRun = day;
      runDailyCycle();
    }

    if (hour === 18 && minute === 30 && lastEveningRun !== day) {
      lastEveningRun = day;
      try {
        generateEveningWrap();
        console.log("[CRON] Evening wrap generated");
      } catch (err) {
        console.error("[CRON] Evening wrap failed:", err.message || err);
      }
    }
  }, 60 * 1000);

  console.log("[CRON] Daily rhythm scheduled with setInterval fallback");
  return { ok: true, mode: "setInterval" };
}

runDailyCycle.startDailyRhythm = startDailyRhythm;
runDailyCycle.generateEveningWrap = generateEveningWrap;

module.exports = runDailyCycle;
