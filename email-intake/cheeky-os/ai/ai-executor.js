/**
 * Cheeky OS — AI executor for safe code-level actions.
 * Accepts { action, target, payload } and validates before executing.
 * All file operations are sandboxed to cheeky-os/ directory.
 *
 * @module cheeky-os/ai/ai-executor
 */

const fs = require("fs");
const path = require("path");
const { logger } = require("../utils/logger");

/** Allowed action types. */
const ALLOWED_ACTIONS = ["CREATE_FILE", "APPEND_ROUTE", "RUN_SCRIPT"];

/** Cheeky-os root for path sandboxing. */
const SANDBOX_ROOT = path.resolve(__dirname, "..");

/**
 * Validate that a target path is within the cheeky-os/ sandbox.
 * @param {string} target - Relative path to validate.
 * @returns {boolean}
 */
function isSafePath(target) {
  if (!target || typeof target !== "string") return false;
  // Must start with cheeky-os/ (relative from project root)
  if (!target.startsWith("cheeky-os/")) return false;
  // Resolved path must still be within sandbox
  const resolved = path.resolve(SANDBOX_ROOT, "..", target);
  return resolved.startsWith(SANDBOX_ROOT);
}

/**
 * Execute a validated AI action.
 * @param {{ action: string, target: string, payload: any }} command
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function execute(command) {
  const { action, target, payload } = command || {};
  const id = Date.now().toString();

  // Validate action type
  if (!ALLOWED_ACTIONS.includes(action)) {
    logger.warn(`[AI-EXEC] ${id} Rejected: unknown action "${action}"`);
    return { ok: false, data: null, error: `Unknown action: ${action}. Allowed: ${ALLOWED_ACTIONS.join(", ")}` };
  }

  // Validate path safety
  if ((action === "CREATE_FILE" || action === "APPEND_ROUTE") && !isSafePath(target)) {
    logger.warn(`[AI-EXEC] ${id} Rejected: unsafe path "${target}"`);
    return { ok: false, data: null, error: `Unsafe target path: "${target}". Must be within cheeky-os/` };
  }

  logger.info(`[AI-EXEC] ${id} Executing: ${action} → ${target || "(no target)"}`);

  try {
    switch (action) {
      case "CREATE_FILE": {
        const fullPath = path.resolve(SANDBOX_ROOT, "..", target);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, payload || "", "utf-8");
        logger.info(`[AI-EXEC] ${id} Created file: ${target}`);
        return { ok: true, data: { file: target, size: (payload || "").length }, error: null };
      }

      case "APPEND_ROUTE": {
        const fullPath = path.resolve(SANDBOX_ROOT, "..", target);
        if (!fs.existsSync(fullPath)) {
          return { ok: false, data: null, error: `Target file does not exist: ${target}` };
        }
        fs.appendFileSync(fullPath, "\n" + payload + "\n", "utf-8");
        logger.info(`[AI-EXEC] ${id} Appended to: ${target}`);
        return { ok: true, data: { file: target, appended: (payload || "").length }, error: null };
      }

      case "RUN_SCRIPT": {
        // Only allow scripts within cheeky-os/
        if (target && !isSafePath(target)) {
          return { ok: false, data: null, error: `Cannot run scripts outside cheeky-os/` };
        }
        logger.info(`[AI-EXEC] ${id} RUN_SCRIPT logged (execution deferred for safety)`);
        return { ok: true, data: { script: target, status: "logged_not_executed" }, error: null };
      }

      default:
        return { ok: false, data: null, error: `Unhandled action: ${action}` };
    }
  } catch (err) {
    logger.error(`[AI-EXEC] ${id} Error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

module.exports = { execute, ALLOWED_ACTIONS, isSafePath };
