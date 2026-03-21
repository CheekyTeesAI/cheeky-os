// PHASE 5 — NEW FILE
/**
 * Logging utility for the Cheeky Tees intake pipeline.
 * Writes to both console (with emoji markers) and logs/intake.log.
 *
 * Console format:
 *   ▶ [STEP] Starting: <step name>
 *   ✅ [STEP] Complete: <step name>
 *   ⚠️ [WARN] <message>
 *   ❌ [ERROR] <message>
 *
 * File format:
 *   [YYYY-MM-DD HH:mm:ss] LEVEL | <message>
 *
 * @module utils/logger
 */

const fs = require("fs");
const path = require("path");

/** Absolute path to the log directory (created on first import). */
const LOG_DIR = path.join(__dirname, "..", "logs");

/** Absolute path to the log file. */
const LOG_FILE = path.join(LOG_DIR, "intake.log");

// Create logs/ directory if it doesn't exist
fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Build a formatted timestamp string.
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
 * Append a single line to the log file. Silently fails if the file
 * cannot be written (never crashes the pipeline).
 * @param {string} level - Log level tag (INFO, WARN, ERROR).
 * @param {string} msg   - Human-readable message.
 */
function appendToFile(level, msg) {
  const line = `[${timestamp()}] ${level} | ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Silent fail — file logging must never crash the intake pipeline
  }
}

/** @type {import("./logger")} */
const logger = {
  /**
   * Log an informational / step message.
   * Messages starting with "Complete:" get the ✅ marker; all others get ▶.
   * @param {string} msg - Message to log.
   */
  info(msg) {
    if (msg.startsWith("Complete:")) {
      console.log(`✅ [STEP] ${msg}`);
    } else {
      console.log(`▶ [STEP] ${msg}`);
    }
    appendToFile("INFO", msg);
  },

  /**
   * Log a warning message.
   * @param {string} msg - Warning text.
   */
  warn(msg) {
    console.log(`⚠️ [WARN] ${msg}`);
    appendToFile("WARN", msg);
  },

  /**
   * Log an error message.
   * @param {string} msg - Error text.
   */
  error(msg) {
    console.error(`❌ [ERROR] ${msg}`);
    appendToFile("ERROR", msg);
  },

  /**
   * Pretty-print a JSON payload to both console and log file.
   * @param {string} label - Descriptive label for the payload.
   * @param {Object} obj   - Object to serialise.
   */
  logPayload(label, obj) {
    const json = JSON.stringify(obj, null, 2);
    console.log(`\n📦 ${label}:\n${json}\n`);
    appendToFile("INFO", `${label}: ${JSON.stringify(obj)}`);
  },
};

module.exports = logger;
