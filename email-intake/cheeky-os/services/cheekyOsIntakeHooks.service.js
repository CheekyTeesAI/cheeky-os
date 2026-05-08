"use strict";

/**
 * CHEEKY OS v4.1 — Optional hook scripts for POST /api/intake (universal) pipeline.
 *
 * CHEEKY_INTAKE_HOOKS_DIR=./cheeky-os/hooks/intake relative to email-intake
 * Loads *.hook.js exporting async function universalIntakeAfterCreate({ intakeId, body, duplicate })
 */

const fs = require("fs");
const path = require("path");
const { logStructured } = require("./cheekyOsStructuredLog.service");

function hooksDirAbs() {
  const rel =
    String(process.env.CHEEKY_INTAKE_HOOKS_DIR || path.join(__dirname, "..", "hooks", "intake")).trim();
  const baseRoot = path.join(__dirname, "..", "..");
  return path.isAbsolute(rel) ? rel : path.join(baseRoot, rel);
}

function hooksEnabled() {
  return String(process.env.CHEEKY_INTAKE_HOOKS_ENABLED || "").match(/^(1|true|on|yes)$/i);
}

async function loadHookModules() {
  const dir = hooksDirAbs();
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".hook.js"))
    .sort();
  /** @type {((ctx: unknown) => Promise<void>)[]} */
  const fns = [];
  for (const f of files) {
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const mod = require(path.join(dir, f));
      if (typeof mod.universalIntakeAfterCreate === "function") {
        fns.push(mod.universalIntakeAfterCreate);
      }
    } catch (e) {
      console.warn(`[intake-hooks] skip ${f}:`, e && e.message ? e.message : e);
    }
  }
  return fns;
}

let _cache = null;
async function cachedHooks() {
  if (!_cache) _cache = loadHookModules();
  return _cache;
}

async function runUniversalIntakeAfterCreate(ctx) {
  if (!hooksEnabled()) return;
  try {
    const mods = await cachedHooks();
    for (const fn of mods) {
      await Promise.resolve(fn(ctx)).catch(() => {});
    }
  } catch (_) {
    /* optional */
  }
  logStructured("intake_hook_done", {
    intakeId: ctx.intakeId,
    duplicate: ctx.duplicate,
  });
}

module.exports = {
  runUniversalIntakeAfterCreate,
};
