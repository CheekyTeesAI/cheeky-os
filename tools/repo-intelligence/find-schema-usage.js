"use strict";
const fs = require("fs");
const { scan, ROOT } = require("./scan");

const { files } = scan();
const jsFiles = files.filter(f => f.endsWith(".js") || f.endsWith(".ts"));

// Find anything that imports from the broken schema's potential output paths
const targets = [
  "src/db/prisma",
  "src/db/schema",
  "src/db/client",
  "db/schema",
  "db/prisma",
  "@prisma/client",
  "prisma-foundation",
  "cheeky-os/prisma"
];

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
        callers.push({ file: rel, lines: found.slice(0, 3) });
      }
    } catch {}
  });
  if (callers.length > 0) {
    console.log("\n=== " + target + " (" + callers.length + " files) ===");
    callers.slice(0, 5).forEach(c => {
      console.log("  " + c.file);
      c.lines.forEach(l => console.log("    L" + l.i + ": " + l.l));
    });
  }
});
