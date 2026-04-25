// CHEEKY RIE — Stub + Incomplete Detector
"use strict";
const fs = require("fs");

const STUB_PATTERNS = [
  "TODO", "FIXME", "STUB", "HACK",
  "not yet active", "awaiting activation",
  "// placeholder", "return null; //",
  "[STUB"
];

function analyzeStubs(files) {
  const stubs = [];
  const jsFiles = files.filter(f => f.endsWith(".js"));

  jsFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const found = [];
      lines.forEach((line, idx) => {
        if (STUB_PATTERNS.some(p => line.includes(p))) {
          found.push({ line: idx + 1, content: line.trim() });
        }
      });
      if (found.length) stubs.push({ file, count: found.length, stubs: found });
    } catch { /* skip */ }
  });

  console.log(`[CHEEKY-GATE] Stubs: ${stubs.length} files contain incomplete patterns`);
  return stubs;
}

module.exports = { analyzeStubs };
