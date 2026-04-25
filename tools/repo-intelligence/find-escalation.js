"use strict";
const fs = require("fs");
const { scan, ROOT } = require("./scan");

const { files } = scan();
const jsFiles = files.filter(f => f.endsWith(".js"));

const targets = ["escalationEngine", "evaluateEscalation", "taskAutogenService"];

targets.forEach(target => {
  const callers = [];
  jsFiles.forEach(f => {
    try {
      const c = fs.readFileSync(f, "utf8");
      if (c.includes(target)) {
        const rel = f.replace(ROOT, "");
        const lines = c.split("\n");
        const found = lines
          .map((l, i) => ({ l: l.trim(), i: i + 1 }))
          .filter(({ l }) => l.includes(target));
        callers.push({ file: rel, lines: found.slice(0, 4) });
      }
    } catch {}
  });
  console.log("\n=== " + target + " (" + callers.length + " files) ===");
  callers.forEach(c => {
    console.log("  FILE: " + c.file);
    c.lines.forEach(l => console.log("    L" + l.i + ": " + l.l));
  });
});
