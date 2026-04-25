/**
 * Idempotent creation of operational directories (relative to process.cwd()).
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_RELATIVE = [
  "uploads",
  "uploads/intake",
  "tmp",
  "tmp/workorders",
  "logs",
  "backups",
  "data",
];

/**
 * @param {string[]} [extraRelative] Additional paths under cwd.
 * @returns {{ created: string[], ensured: string[], errors: string[] }}
 */
function ensureDirectories(extraRelative) {
  const extra = Array.isArray(extraRelative) ? extraRelative : [];
  const rel = [...new Set([...DEFAULT_RELATIVE, ...extra])];
  const created = [];
  const ensured = [];
  const errors = [];

  for (const r of rel) {
    const abs = path.join(process.cwd(), r);
    try {
      if (!fs.existsSync(abs)) {
        fs.mkdirSync(abs, { recursive: true });
        created.push(r);
      } else {
        ensured.push(r);
      }
    } catch (e) {
      errors.push(`${r}: ${e && e.message ? e.message : String(e)}`);
    }
  }

  return { created, ensured, errors };
}

module.exports = {
  ensureDirectories,
  DEFAULT_RELATIVE,
};
