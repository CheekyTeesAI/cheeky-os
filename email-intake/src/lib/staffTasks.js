/**
 * Staff tasks — JSON file store (no Prisma). CommonJS.
 */
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const baseDir = path.join(__dirname, "..", "..");
const storePath = path.join(baseDir, "outputs", "staff-tasks.json");

function ensureStore() {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(
      storePath,
      JSON.stringify({ version: 1, tasks: [] }, null, 2),
      "utf8"
    );
  }
}

function load() {
  ensureStore();
  return JSON.parse(fs.readFileSync(storePath, "utf8"));
}

function save(data) {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), "utf8");
}

/**
 * @param {{ title: string, notes?: string }} input
 */
function addTask(input) {
  const db = load();
  const task = {
    id: `st_${randomUUID()}`,
    title: String(input.title || "").trim() || "(untitled)",
    notes: input.notes ? String(input.notes) : "",
    done: false,
    createdAt: new Date().toISOString(),
  };
  db.tasks.push(task);
  save(db);
  return task;
}

function listTasks() {
  return load().tasks;
}

module.exports = { addTask, listTasks, storePath };
