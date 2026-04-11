require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});

const { main } = require("../cheeky-os/server");

main().catch((err) => {
  console.error(`❌ Startup failed: ${err.message}`);
  process.exit(1);
});
