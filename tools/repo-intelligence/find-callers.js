"use strict";
const fs = require("fs");
const path = require("path");
const { scan, ROOT } = require("./scan");

const { files } = scan();
const jsFiles = files.filter(f => f.endsWith(".js"));

// Find callers of moneyEngine and taskAutogenService
const targets = ["moneyEngine", "taskAutogenService", "generateTasksForOrder"];

targets.forEach(target => {
  const callers = [];
  jsFiles.forEach(f => {
    try {
      const c = fs.readFileSync(f, "utf8");
      if (c.includes(target)) {
        const rel = f.replace(ROOT, "");
        // Find the lines
        const lines = c.split("\n");
        const found = lines
          .map((l, i) => ({ l: l.trim(), i: i + 1 }))
          .filter(({ l }) => l.includes(target));
        callers.push({ file: rel, lines: found.slice(0, 5) });
      }
    } catch {}
  });
  console.log("\n=== Callers of: " + target + " ===");
  if (callers.length === 0) {
    console.log("  (none found)");
  } else {
    callers.forEach(c => {
      console.log("  " + c.file);
      c.lines.forEach(l => console.log("    " + l.i + " | " + l.l));
    });
  }
});
