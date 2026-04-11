/**
 * Cheeky OS — Autopilot engine: one full business cycle.
 *
 * @module cheeky-os/autopilot/engine
 */

console.log("🔥 USING THIS FILE: square-client.js");
const { runAllSystems } = require("../engine/run-all");

/**
 * @returns {Promise<{ ok: boolean, data: object, error: null }>}
 */
async function runAutopilot() {
  return runAllSystems();
}

module.exports = runAutopilot;
