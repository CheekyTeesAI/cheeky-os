#!/usr/bin/env node
/**
 * One-screen environment + module snapshot (read-only).
 */

const path = require("path");
const fs = require("fs");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");
const { logAction } = require(path.join(__dirname, "..", "src", "lib", "systemLog.js"));

loadDotenvFromEmailIntake();

function main() {
  logAction({ action: "system_status", detail: { node: process.version } });

  const root = path.join(__dirname, "..");
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  console.log("");
  console.log("=== CHEEKY OS — SYSTEM STATUS ===");
  console.log("");
  console.log(`Node:     ${process.version}`);
  console.log(`Package:  ${pkg.name}@${pkg.version}`);
  console.log(`CWD:      ${process.cwd()}`);
  console.log(`DATABASE_URL: ${process.env.DATABASE_URL ? "set" : "unset"}`);
  console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "set" : "unset"}`);
  console.log("");
  console.log("Key scripts (dispatch via operator.js):");
  console.log("  overview | revenue | simulate | plan | queue | smoke | …");
  console.log("");
}

main();
