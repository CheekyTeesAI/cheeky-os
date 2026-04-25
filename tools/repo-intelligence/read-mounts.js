"use strict";
const fs = require("fs");
const c = fs.readFileSync("email-intake/cheeky-os/server.js", "utf8");
const lines = c.split("\n");
const mountLines = lines
  .map((l, i) => ({ l, i: i + 1 }))
  .filter(({ l }) => l.includes("app.use("));

console.log("=== server.js app.use() MOUNT POINTS (" + mountLines.length + ") ===");
mountLines.forEach(({ l, i }) => console.log("  " + i + " | " + l.trim()));
