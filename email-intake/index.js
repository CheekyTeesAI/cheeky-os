require("dotenv").config();

const { main } = require("./start");

main().catch((err) => {
  console.error(`❌ Startup failed: ${err.message}`);
  process.exit(1);
});
