/**
 * Repo-root entry when the start command is `node src/start.js` (e.g. Render with project root = repo root).
 * Delegates to email-intake Cheeky OS Express — no legacy webhook server.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", "email-intake", ".env"),
});

const { main } = require("../email-intake/cheeky-os/server");

main().catch((err) => {
  console.error(`❌ Startup failed: ${err.message}`);
  process.exit(1);
});
