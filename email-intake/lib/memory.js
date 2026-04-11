const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "memory");

function ensureStructure() {
  const dirs = [
    ROOT,
    path.join(ROOT, "customers"),
    path.join(ROOT, "sales"),
    path.join(ROOT, "pricing"),
    path.join(ROOT, "production"),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }
  const indexPath = path.join(ROOT, "index.md");
  const logPath = path.join(ROOT, "log.md");
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(
      indexPath,
      "# Cheeky OS — command memory\n\nStructured notes written by the unified command layer.\n",
      "utf8"
    );
  }
  if (!fs.existsSync(logPath)) {
    fs.writeFileSync(logPath, "# Command log\n\n", "utf8");
  }
}

/**
 * @param {string} type - customers | sales | pricing | production
 * @param {string} name - file-safe slug
 * @param {string} content
 */
function writeMemory(type, name, content) {
  ensureStructure();
  const safe = String(name || "entry")
    .replace(/[^a-z0-9-_]+/gi, "_")
    .slice(0, 80);
  const dir = path.join(ROOT, type);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${safe}.md`);
  fs.writeFileSync(filePath, String(content), "utf8");
  return filePath;
}

/**
 * @param {string} entry - markdown block
 */
function appendLog(entry) {
  ensureStructure();
  const logPath = path.join(ROOT, "log.md");
  fs.appendFileSync(logPath, entry + "\n", "utf8");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Summary file: memory/{type}/YYYY-MM-DD-HHmm-{slug}.md
 * @param {string} type - customers | sales | pricing | production
 * @param {string} slug - file-safe fragment
 * @param {string} content
 */
function writeCommandSummary(type, slug, content) {
  ensureStructure();
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const safe = String(slug || "entry")
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  const dir = path.join(ROOT, type);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${stamp}-${safe}.md`);
  fs.writeFileSync(filePath, String(content), "utf8");
  return filePath;
}

module.exports = {
  ensureStructure,
  writeMemory,
  writeCommandSummary,
  appendLog,
  ROOT,
};
