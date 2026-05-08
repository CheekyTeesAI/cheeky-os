#!/usr/bin/env node
/**
 * Windows EPERM workaround: Prisma cannot rename query_engine if the DLL is locked.
 * Run before `prisma generate` if you see EPERM on rename under node_modules/.prisma.
 *
 * Removes .prisma under this package and the monorepo root (npm workspaces hoist).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const roots = [
  path.join(__dirname, "..", "node_modules", ".prisma"),
  path.join(__dirname, "..", "..", "node_modules", ".prisma"),
];

let removed = 0;
for (const dir of roots) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed++;
      console.log("[clean-prisma-client] removed:", dir);
    }
  } catch (e) {
    console.warn("[clean-prisma-client] skip", dir, e.message || e);
  }
}
if (removed === 0) {
  console.log("[clean-prisma-client] no .prisma folders found at expected paths");
}
process.exit(0);
