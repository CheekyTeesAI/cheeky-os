// PHASE 1 — EMAIL AUTO-INTAKE: Outlook inbox poller
/**
 * Polls the configured Outlook mailbox for unread order emails every 5 minutes.
 * Each unread email is fed through the intake pipeline (OpenAI extraction →
 * field mapping → Dataverse POST). Successfully processed emails are marked
 * as read so they are not re-processed.
 *
 * Run standalone: node email-listener/email-poller.js
 * Or via start.js for unified startup.
 *
 * All activity is logged to logs/email-poller.log and console.
 *
 * @module email-listener/email-poller
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const { getUnreadEmails, markAsRead } = require("./graph-client");

// Lazy-load intake functions to avoid circular dependency at module level
let _intake = null;
/**
 * Lazy-load the intake module. Called on first poll cycle so dotenv
 * is fully loaded before intake.js reads process.env.
 * @returns {Object} The intake module exports.
 */
function getIntake() {
  if (!_intake) {
    _intake = require("../intake");
  }
  return _intake;
}

/** Polling interval in milliseconds (5 minutes). */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/** Log directory and file setup. */
const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "email-poller.log");
fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Build a formatted timestamp string for log entries.
 * @returns {string} Timestamp in YYYY-MM-DD HH:mm:ss format.
 */
function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * Log a message to both console and the email-poller log file.
 * @param {string} level - Log level (INFO, WARN, ERROR).
 * @param {string} msg   - Message text.
 */
function log(level, msg) {
  const line = `[${timestamp()}] ${level} | ${msg}`;
  if (level === "ERROR") {
    console.error(`❌ [EMAIL-POLLER] ${msg}`);
  } else if (level === "WARN") {
    console.log(`⚠️ [EMAIL-POLLER] ${msg}`);
  } else {
    console.log(`📧 [EMAIL-POLLER] ${msg}`);
  }
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // Silent fail — logging must never crash the poller
  }
}

/**
 * Strip HTML tags from an email body to get plain text for OpenAI extraction.
 * Handles common HTML email patterns (line breaks, entities, tags).
 * @param {string} html - Raw HTML body from Graph API.
 * @returns {string} Plain text content.
 */
function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Process a single email through the full intake pipeline.
 * Extracts order details via OpenAI, maps fields, and POSTs to Dataverse.
 * On success, marks the email as read.
 * @param {Object} email - Graph API mail message object.
 * @returns {Promise<boolean>} True if processed successfully.
 */
async function processEmail(email) {
  const from = email.from?.emailAddress?.address || "(unknown sender)";
  const subject = email.subject || "(no subject)";
  const bodyContent = email.body?.content || "";
  const bodyType = email.body?.contentType || "text";

  log("INFO", `Processing: "${subject}" from ${from}`);

  // Extract plain text from body
  const plainText = bodyType === "html" ? stripHtml(bodyContent) : bodyContent;

  if (!plainText || plainText.trim().length < 10) {
    log("WARN", `Skipping empty/too-short email from ${from}: "${subject}"`);
    // Mark as read so we don't keep re-checking it
    await markAsRead(email.id);
    return false;
  }

  const intake = getIntake();

  try {
    // Step 1: Extract order details via OpenAI
    const extracted = await intake.extractOrderDetails(plainText);
    log("INFO", `Extracted fields: ${JSON.stringify(extracted)}`);

    // Step 2: Map to Dataverse-ready format
    const mapped = await intake.mapToDataverse(extracted);

    // Step 3: Validate
    const validation = await intake.validateOrder(mapped);
    if (!validation.valid) {
      log("WARN", `Validation warnings for "${subject}": ${validation.warnings.join(", ")}`);
    }

    // Step 4: Send to Dataverse
    const recordId = await intake.sendToDataverse(mapped);
    log("INFO", `✅ Order created from email "${subject}" | Record ID: ${recordId || "(unknown)"}`);

    // Step 5: Create labor record (non-blocking)
    if (recordId) {
      try {
        await intake.createLaborRecord(recordId, from);
      } catch (laborErr) {
        log("WARN", `Labor record skipped: ${laborErr.message}`);
      }
    }

    // Step 6: Mark email as read on success
    await markAsRead(email.id);
    log("INFO", `Marked as read: "${subject}" from ${from}`);

    return true;
  } catch (err) {
    log("ERROR", `Failed to process "${subject}" from ${from}: ${err.message}`);
    // Do NOT mark as read on failure — it will be retried on next poll
    return false;
  }
}

/**
 * Run a single poll cycle: fetch unread emails and process each one.
 * @returns {Promise<{processed: number, failed: number, skipped: number}>}
 */
async function pollOnce() {
  log("INFO", "Poll cycle starting...");

  let emails;
  try {
    emails = await getUnreadEmails();
  } catch (err) {
    log("ERROR", `Failed to fetch emails: ${err.message}`);
    return { processed: 0, failed: 0, skipped: 0 };
  }

  if (emails.length === 0) {
    log("INFO", "No unread emails found.");
    return { processed: 0, failed: 0, skipped: 0 };
  }

  log("INFO", `Found ${emails.length} unread email(s). Processing...`);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const email of emails) {
    try {
      const success = await processEmail(email);
      if (success) {
        processed++;
      } else {
        skipped++;
      }
    } catch (err) {
      log("ERROR", `Unhandled error processing email ${email.id}: ${err.message}`);
      failed++;
    }
  }

  log("INFO", `Poll cycle complete: ${processed} processed, ${skipped} skipped, ${failed} failed`);
  return { processed, failed, skipped };
}

/** Timer reference for the polling interval — used for shutdown. */
let _pollTimer = null;

/**
 * Start the email polling loop. Runs immediately, then every POLL_INTERVAL_MS.
 * @returns {void}
 */
function startPolling() {
  log("INFO", "═══════════════════════════════════════════════════");
  log("INFO", "  📧 Cheeky Tees Email Poller — STARTED");
  log("INFO", `  Mailbox: ${process.env.OUTLOOK_USER_EMAIL || "(not set)"}`);
  log("INFO", `  Interval: ${POLL_INTERVAL_MS / 1000}s (${POLL_INTERVAL_MS / 60000} min)`);
  log("INFO", "═══════════════════════════════════════════════════");

  // Run immediately on start
  pollOnce();

  // Then repeat on interval
  _pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

/**
 * Stop the email polling loop gracefully.
 * @returns {void}
 */
function stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
    log("INFO", "Email poller stopped.");
  }
}

module.exports = { startPolling, stopPolling, pollOnce, processEmail, stripHtml };

// ── Direct execution: node email-listener/email-poller.js ───────────────────
if (require.main === module) {
  startPolling();
}
