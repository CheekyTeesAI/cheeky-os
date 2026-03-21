/**
 * Health Monitor for Cheeky OS.
 * Pings GET /health every 5 minutes. On failure, sends a Teams webhook alert.
 * On recovery, sends a recovery message. Logs all activity.
 *
 * Run standalone: node scripts/health-monitor.js
 * Or via PM2:     pm2 start ecosystem.config.js
 *
 * Requires: PORT (default 3000), TEAMS_WEBHOOK_URL (optional) in .env
 *
 * @module scripts/health-monitor
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const http = require("http");

// ── Config ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HEALTH_URL = `http://127.0.0.1:${PORT}/health`;
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REQUEST_TIMEOUT_MS = 10000; // 10 seconds
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || "";

// ── Logging ─────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "health-monitor.log");
fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Build a formatted timestamp for log entries.
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
 * Log a message to both console and logs/health-monitor.log.
 * @param {string} level - Log level (INFO, WARN, ERROR).
 * @param {string} msg   - Message text.
 */
function log(level, msg) {
  const line = `[${timestamp()}] ${level} | ${msg}`;
  if (level === "ERROR") {
    console.error(`❌ [HEALTH] ${msg}`);
  } else if (level === "WARN") {
    console.log(`⚠️ [HEALTH] ${msg}`);
  } else {
    console.log(`💓 [HEALTH] ${msg}`);
  }
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // Silent fail
  }
}

// ── State ───────────────────────────────────────────────────────────────────
let lastStatus = "unknown"; // "healthy" | "unhealthy" | "unknown"
let failCount = 0;

/**
 * Ping the /health endpoint and return the result.
 * @returns {Promise<{ok: boolean, status: number|null, error: string|null}>}
 */
function pingHealth() {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ ok: false, status: null, error: "Request timed out" });
    }, REQUEST_TIMEOUT_MS);

    try {
      const req = http.get(HEALTH_URL, (res) => {
        clearTimeout(timeout);
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve({ ok: true, status: 200, error: null });
          } else {
            resolve({ ok: false, status: res.statusCode, error: data });
          }
        });
      });

      req.on("error", (err) => {
        clearTimeout(timeout);
        resolve({ ok: false, status: null, error: err.message });
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({ ok: false, status: null, error: err.message });
    }
  });
}

/**
 * Send a message to Microsoft Teams via incoming webhook.
 * @param {string} title   - Card title.
 * @param {string} text    - Card body text.
 * @param {string} color   - Theme color hex (e.g. "FF0000" for red).
 * @returns {Promise<void>}
 */
async function sendTeamsAlert(title, text, color) {
  if (!TEAMS_WEBHOOK_URL) {
    log("WARN", "Teams alert skipped — TEAMS_WEBHOOK_URL not configured");
    return;
  }

  try {
    const payload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: color,
      summary: title,
      sections: [
        {
          activityTitle: title,
          activitySubtitle: `Cheeky OS Health Monitor — ${timestamp()}`,
          text,
          markdown: true,
        },
      ],
    };

    const res = await fetch(TEAMS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      log("INFO", `Teams alert sent: ${title}`);
    } else {
      log("ERROR", `Teams alert failed (${res.status}): ${await res.text()}`);
    }
  } catch (err) {
    log("ERROR", `Teams alert error: ${err.message}`);
  }
}

/**
 * Run a single health check cycle. Pings /health, logs result,
 * and sends Teams alerts on failure or recovery.
 * @returns {Promise<void>}
 */
async function checkHealth() {
  const result = await pingHealth();

  if (result.ok) {
    log("INFO", `Health check OK (${HEALTH_URL})`);
    failCount = 0;

    // Recovery: was unhealthy, now healthy again
    if (lastStatus === "unhealthy") {
      log("INFO", "🟢 SERVICE RECOVERED — /health endpoint is responding again");
      await sendTeamsAlert(
        "🟢 CHEEKY OS RECOVERED",
        `/health endpoint is responding again at ${timestamp()}. Service has recovered.`,
        "00CC00"
      );
    }
    lastStatus = "healthy";
  } else {
    failCount++;
    log("ERROR", `Health check FAILED (attempt #${failCount}): ${result.error || `HTTP ${result.status}`}`);

    // Only alert on first failure (not every 5 min)
    if (lastStatus !== "unhealthy") {
      log("ERROR", "🔴 SERVICE DOWN — /health endpoint failed");
      await sendTeamsAlert(
        "🔴 CHEEKY OS HEALTH ALERT",
        `**/health endpoint failed** at ${timestamp()}.\n\nError: ${result.error || `HTTP ${result.status}`}\n\nCheck \`logs/pm2-error.log\` for details.`,
        "FF0000"
      );
    }
    lastStatus = "unhealthy";
  }
}

/**
 * Start the health monitor. Checks immediately, then every 5 minutes.
 */
function startMonitor() {
  log("INFO", "═══════════════════════════════════════════════════");
  log("INFO", "  💓 Cheeky OS Health Monitor — STARTED");
  log("INFO", `  Target: ${HEALTH_URL}`);
  log("INFO", `  Interval: ${POLL_INTERVAL_MS / 1000}s (${POLL_INTERVAL_MS / 60000} min)`);
  log("INFO", `  Teams Alerts: ${TEAMS_WEBHOOK_URL ? "ENABLED" : "DISABLED (set TEAMS_WEBHOOK_URL)"}`);
  log("INFO", "═══════════════════════════════════════════════════");

  // Initial check
  checkHealth();

  // Recurring checks
  setInterval(checkHealth, POLL_INTERVAL_MS);
}

module.exports = { startMonitor, checkHealth, pingHealth, sendTeamsAlert, log };

// ── Direct execution ────────────────────────────────────────────────────────
if (require.main === module) {
  startMonitor();
}
