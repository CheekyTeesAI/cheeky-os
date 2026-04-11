require("dotenv").config();

const { main } = require("./cheeky-os/server");

main().catch((err) => {
  console.error(`❌ Startup failed: ${err.message}`);
  process.exit(1);
});
