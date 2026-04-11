"use strict";

const { execSync } = require("child_process");

function run(cmd) {
  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  run("npx prisma generate");
  run("npx prisma migrate deploy");
  console.log("Prisma ready");
} catch (e) {
  console.log("Bootstrap error:", e.message);
}
