// CHEEKY REPO INTELLIGENCE ENGINE v4.6
// Run: node tools/repo-intelligence/scan.js
// Output: tools/repo-intelligence/output/report.json + report.md
"use strict";

const fs   = require("fs");
const path = require("path");

const ROOT   = path.resolve(__dirname, "../..");
const IGNORE = ["node_modules", ".git", "dist", "build", "coverage", ".next",
                "generated", "tmp", "backups", "_solution_unpacked",
                "CheekyOsSolution", "CheekyTeesAutomationSolution", "kos"];

function getAllFiles(dir, files = []) {
  let items;
  try { items = fs.readdirSync(dir); } catch { return files; }
  for (const item of items) {
    if (IGNORE.includes(item) || item.startsWith(".")) continue;
    const full = path.join(dir, item);
    try {
      if (fs.statSync(full).isDirectory()) getAllFiles(full, files);
      else files.push(full);
    } catch { /* skip */ }
  }
  return files;
}

function scan() {
  const files = getAllFiles(ROOT);
  console.log(`[CHEEKY-GATE] RIE scan: ${files.length} files found`);
  return { totalFiles: files.length, files, scannedAt: Date.now() };
}

module.exports = { scan, getAllFiles, ROOT };
