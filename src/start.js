/**
 * Repo-root entry when the start command is `node src/start.js` (project root = git root).
 * Loads only ../email-intake/cheeky-os/server. Do not require ./webhook/server or
 * ./email-listener/email-poller from this path — those modules live under email-intake/.
 */
require("dotenv").config({
  path: require("path").join(__dirname, "..", "email-intake", ".env"),
});

const { main } = require("../email-intake/cheeky-os/server");

main().catch((err) => {
  console.error(`❌ Startup failed: ${err.message}`);
  process.exit(1);
});
