/**
 * Shop team roster — file-backed defaults (Jeremy / Patrick).
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE = path.join(DATA_DIR, "team.json");

const DEFAULT_MEMBERS = [
  { id: "jeremy", name: "Jeremy", role: "PRINTER", active: true },
  { id: "patrick", name: "Patrick", role: "OWNER", active: true },
];

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) {
      fs.writeFileSync(STORE, JSON.stringify({ members: DEFAULT_MEMBERS }, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

function readMembers() {
  ensureFile();
  try {
    const raw = fs.readFileSync(STORE, "utf8");
    const doc = JSON.parse(raw || "{}");
    return Array.isArray(doc.members) && doc.members.length ? doc.members : DEFAULT_MEMBERS.slice();
  } catch (_e) {
    return DEFAULT_MEMBERS.slice();
  }
}

function writeMembers(members) {
  ensureFile();
  try {
    fs.writeFileSync(STORE, JSON.stringify({ members }, null, 2), "utf8");
  } catch (e) {
    console.warn("[teamService] write failed:", e && e.message ? e.message : e);
  }
}

function getTeam() {
  return readMembers().filter((m) => m && m.active !== false);
}

function getMemberById(id) {
  const p = String(id || "").toLowerCase().trim();
  return readMembers().find((m) => m && String(m.id).toLowerCase() === p) || null;
}

/**
 * Resolve who should receive DESIGN work — first active DESIGN, else OWNER.
 */
function getDesignAssigneeId() {
  const members = readMembers();
  const design = members.find((m) => m && m.active !== false && String(m.role).toUpperCase() === "DESIGN");
  if (design) return design.id;
  const owner = members.find((m) => m && m.active !== false && String(m.role).toUpperCase() === "OWNER");
  return owner ? owner.id : "patrick";
}

/**
 * First active PRINTER, else null.
 */
function getPrinterAssigneeId() {
  const members = readMembers();
  const p = members.find((m) => m && m.active !== false && String(m.role).toUpperCase() === "PRINTER");
  return p ? p.id : "jeremy";
}

function getOwnerAssigneeId() {
  const members = readMembers();
  const o = members.find((m) => m && m.active !== false && String(m.role).toUpperCase() === "OWNER");
  return o ? o.id : "patrick";
}

module.exports = {
  getTeam,
  getMemberById,
  getDesignAssigneeId,
  getPrinterAssigneeId,
  getOwnerAssigneeId,
  readMembers,
  writeMembers,
  DEFAULT_MEMBERS,
};
