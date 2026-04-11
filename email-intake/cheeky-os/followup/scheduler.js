/**
 * Cheeky OS — Followup scheduler.
 * Runs the followup cycle every 6 hours when started.
 * Does NOT auto-start on import.
 *
 * @module cheeky-os/followup/scheduler
 */

const { runFollowupCycle } = require("./engine");
const { syncAllTrackedPayments } = require("../payments/square-sync");

const SIX_HOURS = 6 * 60 * 60 * 1000;
let intervalHandle = null;

/**
 * Start the followup scheduler (runs every 6 hours).
 * Safe to call multiple times — only one interval will run.
 */
function startFollowupScheduler() {
  if (intervalHandle) {
    console.log("[FOLLOWUP-SCHEDULER] Already running — skipping duplicate start");
    return;
  }

  console.log("[FOLLOWUP-SCHEDULER] Started — will run every 6 hours");

  intervalHandle = setInterval(async () => {
    try {
      // Sync payments before followup cycle so paid deals are excluded
      try {
        const syncResult = await syncAllTrackedPayments();
        console.log(`[FOLLOWUP-SCHEDULER] Payment sync: ${syncResult.data?.synced || 0} checked`);
      } catch (syncErr) {
        console.error(`[FOLLOWUP-SCHEDULER] Payment sync failed (non-blocking): ${syncErr.message}`);
      }

      const result = runFollowupCycle();
      console.log(`[FOLLOWUP-SCHEDULER] Cycle complete: ${result.count} followups sent`);
    } catch (err) {
      console.error(`[FOLLOWUP-SCHEDULER] Cycle failed: ${err.message}`);
    }
  }, SIX_HOURS);
}

/**
 * Stop the followup scheduler.
 */
function stopFollowupScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[FOLLOWUP-SCHEDULER] Stopped");
  }
}

module.exports = { startFollowupScheduler, stopFollowupScheduler };
