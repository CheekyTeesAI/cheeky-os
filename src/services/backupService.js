/**
 * Structured full backup — JSON state only, no secrets.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { getBuildInfo } = require("./buildInfoService");

const SCHEMA_VERSION = 1;

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8") || "{}");
  } catch (_e) {
    return fallback;
  }
}

function buildRecordCounts(payload) {
  const d = payload.data || {};
  return {
    jobs: Array.isArray(d.jobs) ? d.jobs.length : 0,
    customers: Array.isArray(d.customers) ? d.customers.length : 0,
    intakeRecords: Array.isArray(d.intakeRecords) ? d.intakeRecords.length : 0,
    tasksAssignments: Array.isArray(d.tasks && d.tasks.assignments) ? d.tasks.assignments.length : 0,
    communications: Array.isArray(d.communications) ? d.communications.length : 0,
    serviceDeskItems: Array.isArray(d.serviceDeskItems) ? d.serviceDeskItems.length : 0,
    purchaseOrders: Array.isArray(d.purchaseOrders) ? d.purchaseOrders.length : 0,
    teamMembers: Array.isArray(d.teamMembers) ? d.teamMembers.length : 0,
    auditLogEntries: Array.isArray(d.auditLogEntries) ? d.auditLogEntries.length : 0,
  };
}

function loadAuditTail(limit) {
  const p = path.join(process.cwd(), "data", "audit-log.json");
  const doc = readJsonSafe(p, { entries: [] });
  const entries = Array.isArray(doc.entries) ? doc.entries : [];
  return entries.slice(-limit);
}

function buildSystemBackup() {
  const dataDir = path.join(process.cwd(), "data");
  const jobsDoc = readJsonSafe(path.join(dataDir, "cheeky-jobs.json"), { jobs: [] });
  const customersDoc = readJsonSafe(path.join(dataDir, "customers.json"), { customers: [] });
  const intakeDoc = readJsonSafe(path.join(dataDir, "intake-records.json"), { records: [] });
  const teamDoc = readJsonSafe(path.join(dataDir, "team-execution.json"), {
    version: 1,
    assignments: [],
    completedToday: [],
    jobFlags: {},
  });
  const commDoc = readJsonSafe(path.join(dataDir, "communications.json"), { communications: [] });
  const sdDoc = readJsonSafe(path.join(dataDir, "service-desk-items.json"), { items: [] });
  const poDoc = readJsonSafe(path.join(dataDir, "purchase-orders.json"), { orders: [] });
  const teamMembersDoc = readJsonSafe(path.join(dataDir, "team.json"), { members: [] });
  const shopProfile = readJsonSafe(path.join(dataDir, "shop-profile.json"), null);
  const ctrl = safeRequireSystemControl();
  const automation = readJsonSafe(path.join(dataDir, "automation-state.json"), {});
  const squareSync = readJsonSafe(path.join(dataDir, "square-sync-state.json"), {});

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    appName: "Cheeky OS",
    createdAt: new Date().toISOString(),
    appVersion: getBuildInfo().version,
    mode: "FULL",
    data: {
      jobs: jobsDoc.jobs || [],
      customers: customersDoc.customers || [],
      intakeRecords: intakeDoc.records || [],
      tasks: teamDoc,
      communications: commDoc.communications || [],
      serviceDeskItems: sdDoc.items || [],
      purchaseOrders: poDoc.orders || [],
      teamMembers: teamMembersDoc.members || [],
      auditLogEntries: loadAuditTail(400),
    },
    configSnapshot: {
      shopProfile: shopProfile && typeof shopProfile === "object" ? stripSecrets(shopProfile) : null,
      systemControl: ctrl,
      automationStateNonSecret: {
        paused: Boolean(automation.paused),
        rulesKeys: automation.rules && typeof automation.rules === "object" ? Object.keys(automation.rules) : [],
      },
      squareSyncMeta: {
        lastRun: squareSync.lastRun || squareSync.lastSync || null,
        keys: typeof squareSync === "object" ? Object.keys(squareSync).slice(0, 20) : [],
      },
    },
  };

  const recordCounts = buildRecordCounts(payload);
  payload.recordCounts = recordCounts;

  const id = crypto.randomBytes(6).toString("hex");
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${ts}-${id}.json`;
  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const filePath = path.join(backupDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");

  return {
    backupId: fileName.replace(/\.json$/i, ""),
    path: filePath,
    recordCounts,
    createdAt: payload.createdAt,
    schemaVersion: SCHEMA_VERSION,
  };
}

function safeRequireSystemControl() {
  try {
    const ctrl = require("./systemControlService");
    const st = ctrl.readState && ctrl.readState();
    if (!st || typeof st !== "object") return {};
    return {
      paused: !!st.paused,
      safeMode: !!st.safeMode,
      locked: !!st.locked,
      updatedAt: st.updatedAt || null,
    };
  } catch (_e) {
    return {};
  }
}

function stripSecrets(obj) {
  const o = JSON.parse(JSON.stringify(obj));
  const redact = (v) => (typeof v === "string" && v.length > 4 ? "***" : v);
  if (o && typeof o === "object") {
    for (const k of Object.keys(o)) {
      if (/secret|token|password|key|auth/i.test(k)) o[k] = redact(o[k]);
    }
  }
  return o;
}

function listBackups() {
  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) return [];
  const names = fs.readdirSync(backupDir).filter((n) => n.endsWith(".json"));
  const rows = names.map((name) => {
    const fp = path.join(backupDir, name);
    let stat;
    try {
      stat = fs.statSync(fp);
    } catch (_e) {
      stat = { mtime: new Date(0), size: 0 };
    }
    return {
      backupId: name.replace(/\.json$/i, ""),
      fileName: name,
      path: fp,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  });
  rows.sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt)));
  return rows;
}

function getBackupById(id) {
  const raw = String(id || "").trim();
  if (!raw) return null;
  const safe = path.basename(raw);
  if (!safe.endsWith(".json")) {
    const withJson = `${safe}.json`;
    const p = path.join(process.cwd(), "backups", withJson);
    if (fs.existsSync(p)) return p;
  }
  const p = path.join(process.cwd(), "backups", safe);
  return fs.existsSync(p) ? p : null;
}

module.exports = {
  buildSystemBackup,
  listBackups,
  getBackupById,
  SCHEMA_VERSION,
};
