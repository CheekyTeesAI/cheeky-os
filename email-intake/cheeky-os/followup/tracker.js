/**
 * Cheeky OS — Followup tracker.
 * Persists followup records to data/cheeky-followups.json.
 *
 * @module cheeky-os/followup/tracker
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "cheeky-followups.json");

/**
 * Ensure the data directory and file exist.
 */
function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf8");
}

/**
 * Read all records from disk.
 * @returns {Array}
 */
function readAll() {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Write all records to disk.
 * @param {Array} records
 */
function writeAll(records) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), "utf8");
}

/**
 * Save a followup record. Appends if new, updates if same id or invoiceId.
 * @param {{ id: string, customerName: string, customerEmail: string, invoiceId: string, total: number, deposit: number, status: string, stage: string, lastContactAt: string, createdAt: string, notes: string }} record
 * @returns {object} The saved record.
 */
function saveFollowupRecord(record) {
  const records = readAll();
  const idx = records.findIndex(
    (r) => r.id === record.id || (record.invoiceId && r.invoiceId === record.invoiceId)
  );

  if (idx >= 0) {
    records[idx] = { ...records[idx], ...record };
  } else {
    records.push(record);
  }

  writeAll(records);
  return idx >= 0 ? records[idx] : record;
}

/**
 * Get all followup records.
 * @returns {Array}
 */
function getAllFollowups() {
  return readAll();
}

/**
 * Get open followups — not paid and not closed.
 * @returns {Array}
 */
function getOpenFollowups() {
  return readAll().filter((r) => r.status !== "paid" && r.stage !== "closed");
}

/**
 * Get a single followup by id.
 * @param {string} id
 * @returns {object|null}
 */
function getFollowupById(id) {
  return readAll().find((r) => r.id === id) || null;
}

/**
 * Merge updates into an existing record and persist.
 * @param {string} id
 * @param {object} updates
 * @returns {object|null} The updated record, or null if not found.
 */
function markFollowupStatus(id, updates) {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return null;

  records[idx] = { ...records[idx], ...updates };
  writeAll(records);
  return records[idx];
}

module.exports = {
  saveFollowupRecord,
  getAllFollowups,
  getOpenFollowups,
  getFollowupById,
  markFollowupStatus,
};
