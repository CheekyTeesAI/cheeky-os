"use strict";

/**
 * PHASES 2-4 — Daily Cash Runner + Duplicate Prevention
 *
 * Automatically:
 *   1. Pulls unpaid invoices (followup.data.service)
 *   2. Filters out recently contacted (48h cooldown)
 *   3. Generates follow-up drafts (followup.ai.service)
 *   4. Saves to store + updates history
 *   5. Returns run report
 *
 * SUPREME LAWS:
 *   - NO AUTO-SEND (drafts only)
 *   - No duplicates (48h cooldown enforced)
 *   - Fail safe — never crashes server
 *   - Silent operation
 */

const followupData = require("./followup.data.service");
const followupAI   = require("./followup.ai.service");
const store        = require("./followup.store");

// ─── State ────────────────────────────────────────────────────────────────────
let _lastRunAt     = null;
let _lastRunResult = null;
let _runCount      = 0;
let _started       = false;
let _intervalHandle = null;

const COOLDOWN_HOURS   = 48;
const DEFAULT_LIMIT    = 20;
const RUN_INTERVAL_MS  = 24 * 60 * 60 * 1000;  // 24 hours

/**
 * Core runner — pull → filter → generate → store.
 *
 * @param {object} [options]
 * @param {number} [options.limit] - Max invoices to process
 * @param {string} [options.triggeredBy]
 * @param {number} [options.cooldownHours] - Dedup window (default 48h)
 * @returns {Promise<object>} Run report
 */
async function runDailyCashCheck(options) {
  const limit        = Math.min(Number((options && options.limit) || DEFAULT_LIMIT), 100);
  const cooldown     = Number((options && options.cooldownHours) || COOLDOWN_HOURS);
  const triggeredBy  = (options && options.triggeredBy) || "daily-scheduler";

  const report = {
    ok: true,
    triggeredBy,
    startedAt: new Date().toISOString(),
    invoicesChecked: 0,
    draftsCreated: 0,
    skippedDuplicates: 0,
    skippedNoEmail: 0,
    errors: [],
    drafts: [],
  };

  try {
    // ── Step 1: Pull unpaid invoices ────────────────────────────────────────
    let invoices = [];
    try {
      invoices = await followupData.getUnpaidInvoices(limit);
    } catch (err) {
      report.errors.push(`Data fetch failed: ${err && err.message ? err.message : err}`);
      report.ok = false;
      return finalize(report);
    }

    report.invoicesChecked = invoices.length;

    // ── Step 2: Filter + generate ───────────────────────────────────────────
    for (const invoice of invoices) {
      const invoiceId = invoice.invoiceId || invoice.orderId || "";

      // Skip if no email (can't follow up)
      if (!invoice.email || invoice.email.includes("square-import") || invoice.email.includes("@square")) {
        report.skippedNoEmail++;
        continue;
      }

      // PHASE 2 — Duplicate prevention: skip if followed up within cooldown window
      if (invoiceId && !store.isFollowUpEligible(invoiceId, cooldown)) {
        const hist = store.getHistory(invoiceId);
        report.skippedDuplicates++;
        report.drafts.push({
          invoiceId,
          customerName: invoice.customerName,
          status: "skipped_duplicate",
          lastFollowUp: hist && hist.lastFollowUp,
          followUpCount: hist && hist.followUpCount,
        });
        continue;
      }

      // ── Step 3: Generate message ──────────────────────────────────────────
      let message;
      try {
        message = followupAI.generateFollowUp(invoice);
      } catch (genErr) {
        report.errors.push(`Message gen failed for ${invoiceId}: ${genErr && genErr.message ? genErr.message : genErr}`);
        continue;
      }

      // ── Step 4: Save draft + update history ───────────────────────────────
      const draft = store.saveDraft({ ...invoice, ...message, status: "draft" });
      if (invoiceId) store.updateHistory(invoiceId);

      report.draftsCreated++;
      report.drafts.push({
        invoiceId,
        draftId: draft.id,
        customerName: invoice.customerName,
        amount: invoice.amount,
        tone: message.tone,
        subject: message.subject,
        status: "draft_created",
      });
    }
  } catch (err) {
    report.ok = false;
    report.errors.push(`Runner error: ${err && err.message ? err.message : String(err)}`);
  }

  return finalize(report);
}

function finalize(report) {
  report.completedAt = new Date().toISOString();
  _lastRunAt = report.completedAt;
  _lastRunResult = {
    ok: report.ok,
    invoicesChecked: report.invoicesChecked,
    draftsCreated: report.draftsCreated,
    skippedDuplicates: report.skippedDuplicates,
    skippedNoEmail: report.skippedNoEmail,
    errors: report.errors.length,
  };
  _runCount++;

  if (report.draftsCreated > 0) {
    console.log(`[daily-cash] run #${_runCount}: ${report.draftsCreated} drafts created, ${report.skippedDuplicates} duplicates skipped`);
  }

  return report;
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Start the daily scheduler (24h interval + immediate first run after 30s).
 */
function start() {
  if (_started) {
    console.log("[daily-cash] scheduler already running — skipping duplicate start");
    return;
  }
  _started = true;

  // Fire first run after short startup grace period
  setTimeout(async () => {
    console.log("[daily-cash] initial cash check starting...");
    await runDailyCashCheck({ triggeredBy: "startup" });
  }, 30000);  // 30s after boot

  _intervalHandle = setInterval(async () => {
    await runDailyCashCheck({ triggeredBy: "daily-cron" });
  }, RUN_INTERVAL_MS);

  console.log("[daily-cash] scheduler started — runs every 24h, first run in 30s");
}

/**
 * Stop the daily scheduler.
 */
function stop() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
  _started = false;
  console.log("[daily-cash] scheduler stopped");
}

/**
 * Get runner status for reporting.
 */
function getStatus() {
  return {
    started: _started,
    runCount: _runCount,
    lastRunAt: _lastRunAt,
    lastRunResult: _lastRunResult,
    cooldownHours: COOLDOWN_HOURS,
    intervalHours: RUN_INTERVAL_MS / 3600000,
  };
}

module.exports = { runDailyCashCheck, start, stop, getStatus };
