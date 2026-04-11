/**
 * Cheeky OS — Environment variable guard.
 * Checks all required env vars at startup and throws one combined error if any are missing.
 *
 * @module cheeky-os/safety/env-guard
 */

/** Required environment variables for Cheeky OS to function. */
const REQUIRED_VARS = [
  "OPENAI_API_KEY",
  "BASE_URL",
  "GITHUB_TOKEN",
  "GITHUB_REPO",
  "RENDER_DEPLOY_HOOK_URL",
];

/**
 * Check that all required environment variables are set.
 * Logs warnings for missing optional vars instead of failing.
 * @throws {Error} If any required vars are missing.
 */
function checkEnv() {
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);

  // SQUARE_ACCESS_TOKEN is optional — warn but don't block
  if (!process.env.SQUARE_ACCESS_TOKEN) {
    console.log("[CHEEKY-OS] ⚠️  SQUARE_ACCESS_TOKEN not set — invoice features will use mock mode");
  }

  if (missing.length > 0) {
    throw new Error(
      `[CHEEKY-OS] Missing required environment variables:\n` +
      missing.map((v) => `  → ${v}`).join("\n") +
      `\nSet these in .env or your hosting provider.`
    );
  }
}

module.exports = { checkEnv, REQUIRED_VARS };
