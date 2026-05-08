/**
 * Tiny shared utilities for email-intake operator CLI scripts (CommonJS).
 * No business rules — scaffolding, argv, formatting, exit codes only.
 */

const path = require("path");

/** Load `.env` from `email-intake/` when scripts run with cwd anywhere. */
function loadDotenvFromEmailIntake() {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env"),
  });
}

/**
 * Parse `--key value` pairs; flags without values become `true`.
 * Optional `booleanFlags`: Set of key names (no `--`) that never consume the next argv token.
 */
function parsePairArgs(argv, options) {
  const booleanKeys =
    options && options.booleanFlags instanceof Set
      ? options.booleanFlags
      : new Set(
          Array.isArray(options && options.booleanFlags)
            ? options.booleanFlags
            : []
        );
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    if (booleanKeys.has(key)) {
      out[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

/** Collect `{ key, value }` for each lookup key present in `args` with a non-empty string value. */
function collectLookups(args, lookupKeys) {
  const found = [];
  for (const k of lookupKeys) {
    const v = args[k];
    if (v !== undefined && v !== true && String(v).trim() !== "") {
      found.push({ key: k, value: String(v).trim() });
    }
  }
  return found;
}

function formatIsoDate(d) {
  if (!d) return "(none)";
  try {
    return d instanceof Date ? d.toISOString() : String(d);
  } catch {
    return String(d);
  }
}

function printBanner(title) {
  console.log("");
  console.log(`=== ${title} ===`);
  console.log("");
}

function setExitNotFound() {
  process.exitCode = 1;
}

function setExitAmbiguous() {
  process.exitCode = 2;
}

module.exports = {
  loadDotenvFromEmailIntake,
  parsePairArgs,
  collectLookups,
  formatIsoDate,
  printBanner,
  setExitNotFound,
  setExitAmbiguous,
};
