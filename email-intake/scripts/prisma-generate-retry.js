#!/usr/bin/env node
/**
 * Retry prisma generate when Windows returns EPERM on query_engine rename (AV/locking).
 * Does not use prisma --force (flag not supported on all versions).
 */
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const root = path.join(__dirname, "..");
const attempts = Math.max(1, Number(process.env.PRISMA_GENERATE_ATTEMPTS || 6));
const delayMs = Math.max(500, Number(process.env.PRISMA_GENERATE_RETRY_MS || 3000));

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const internalArgs = ["prisma", "generate", "--schema", "prisma/schema.prisma"];

for (let i = 1; i <= attempts; i++) {
  const r = spawnSync("npx", internalArgs, {
    cwd: root,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  if (r.status === 0) {
    console.log("[prisma-generate-retry] ok on attempt " + i);
    process.exit(0);
  }
  console.warn("[prisma-generate-retry] attempt " + i + "/" + attempts + " failed (exit " + r.status + ")");
  if (i < attempts) sleep(delayMs);
}

console.error("[prisma-generate-retry] giving up — close Node/antivirus locks on node_modules/.prisma then retry");
process.exit(1);
