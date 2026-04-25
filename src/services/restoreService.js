/**
 * Safe restore — preview, merge, or replace selected groups only.
 */
const fs = require("fs");
const path = require("path");
const { validateBackupFile } = require("./restoreValidationService");

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8") || "{}");
  } catch (_e) {
    return fallback;
  }
}

function writeJson(filePath, obj) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function indexBy(arr, keyFn) {
  const m = new Map();
  for (const row of Array.isArray(arr) ? arr : []) {
    const k = keyFn(row);
    if (k) m.set(String(k), row);
  }
  return m;
}

function resolveSafePath(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const base = path.basename(raw);
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(process.cwd(), raw.replace(/^\//, ""));
  const backupsRoot = path.resolve(process.cwd(), "backups");
  const dataRoot = path.resolve(process.cwd(), "data");
  if (abs.startsWith(backupsRoot)) return abs;
  if (abs.startsWith(dataRoot)) return null;
  const underBackups = path.resolve(backupsRoot, base);
  if (underBackups.startsWith(backupsRoot) && fs.existsSync(underBackups)) return underBackups;
  return null;
}

function computeMergePreview(backupData) {
  const dataDir = path.join(process.cwd(), "data");
  const curJobs = readJson(path.join(dataDir, "cheeky-jobs.json"), { jobs: [] }).jobs || [];
  const curCust = readJson(path.join(dataDir, "customers.json"), { customers: [] }).customers || [];
  const curInt = readJson(path.join(dataDir, "intake-records.json"), { records: [] }).records || [];
  const curComm = readJson(path.join(dataDir, "communications.json"), { communications: [] }).communications || [];
  const curSd = readJson(path.join(dataDir, "service-desk-items.json"), { items: [] }).items || [];
  const curPo = readJson(path.join(dataDir, "purchase-orders.json"), { orders: [] }).orders || [];
  const curTeam = readJson(path.join(dataDir, "team.json"), { members: [] }).members || [];
  const curTasks = readJson(path.join(dataDir, "team-execution.json"), {
    version: 1,
    assignments: [],
    completedToday: [],
    jobFlags: {},
  });

  const b = backupData && typeof backupData === "object" ? backupData : {};

  const jIdx = indexBy(curJobs, (r) => r && r.jobId);
  let newJobs = 0;
  let dupJobs = 0;
  for (const j of Array.isArray(b.jobs) ? b.jobs : []) {
    if (!j || !j.jobId) continue;
    if (jIdx.has(String(j.jobId))) dupJobs += 1;
    else newJobs += 1;
  }

  const cIdx = indexBy(curCust, (r) => r && (r.id || r.email));
  let newCust = 0;
  let dupCust = 0;
  for (const c of Array.isArray(b.customers) ? b.customers : []) {
    const k = c && (c.id || c.email);
    if (!k) continue;
    if (cIdx.has(String(k))) dupCust += 1;
    else newCust += 1;
  }

  const iIdx = indexBy(curInt, (r) => r && r.id);
  let newInt = 0;
  let dupInt = 0;
  for (const r of Array.isArray(b.intakeRecords) ? b.intakeRecords : []) {
    if (!r || !r.id) continue;
    if (iIdx.has(String(r.id))) dupInt += 1;
    else newInt += 1;
  }

  const coIdx = indexBy(curComm, (r) => r && r.id);
  let newComm = 0;
  let dupComm = 0;
  for (const r of Array.isArray(b.communications) ? b.communications : []) {
    if (!r || !r.id) continue;
    if (coIdx.has(String(r.id))) dupComm += 1;
    else newComm += 1;
  }

  const sdIdx = indexBy(curSd, (r) => r && r.id);
  let newSd = 0;
  let dupSd = 0;
  for (const r of Array.isArray(b.serviceDeskItems) ? b.serviceDeskItems : []) {
    if (!r || !r.id) continue;
    if (sdIdx.has(String(r.id))) dupSd += 1;
    else newSd += 1;
  }

  const poIdx = indexBy(curPo, (r) => r && r.poNumber);
  let newPo = 0;
  let dupPo = 0;
  for (const r of Array.isArray(b.purchaseOrders) ? b.purchaseOrders : []) {
    if (!r || !r.poNumber) continue;
    if (poIdx.has(String(r.poNumber))) dupPo += 1;
    else newPo += 1;
  }

  const tmIdx = indexBy(curTeam, (r) => r && r.id);
  let newTm = 0;
  let dupTm = 0;
  for (const r of Array.isArray(b.teamMembers) ? b.teamMembers : []) {
    if (!r || !r.id) continue;
    if (tmIdx.has(String(r.id))) dupTm += 1;
    else newTm += 1;
  }

  const asIdx = indexBy(curTasks.assignments || [], (r) => r && r.taskId);
  let newAs = 0;
  let dupAs = 0;
  const bTasks = b.tasks && typeof b.tasks === "object" ? b.tasks : {};
  for (const r of Array.isArray(bTasks.assignments) ? bTasks.assignments : []) {
    if (!r || !r.taskId) continue;
    if (asIdx.has(String(r.taskId))) dupAs += 1;
    else newAs += 1;
  }

  return {
    wouldImport: { newJobs, newCust, newInt, newComm, newSd, newPo, newTm, newAs },
    duplicates: { dupJobs, dupCust, dupInt, dupComm, dupSd, dupPo, dupTm, dupAs },
  };
}

function previewRestore(filePath) {
  const safe = resolveSafePath(filePath);
  if (!safe) {
    return {
      mode: "PREVIEW",
      success: false,
      importedCounts: {},
      skippedCounts: {},
      duplicateWarnings: [],
      errors: ["invalid_or_unsafe_file_path"],
    };
  }
  const val = validateBackupFile(safe);
  if (!val.valid) {
    return {
      mode: "PREVIEW",
      success: false,
      importedCounts: {},
      skippedCounts: {},
      duplicateWarnings: val.warnings || [],
      errors: val.blockingIssues || ["invalid_backup"],
      validation: val,
    };
  }
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(safe, "utf8") || "{}");
  } catch (e) {
    return {
      mode: "PREVIEW",
      success: false,
      errors: [e && e.message ? e.message : "read_failed"],
    };
  }
  const impact = computeMergePreview(doc.data || {});
  return {
    mode: "PREVIEW",
    success: true,
    importedCounts: impact.wouldImport,
    skippedCounts: {},
    duplicateWarnings: Object.entries(impact.duplicates).map(([k, v]) => `${k}:${v}`),
    errors: [],
    validation: val,
    impactSummary: impact,
  };
}

const ALLOWED_GROUPS = new Set([
  "jobs",
  "customers",
  "intake",
  "communications",
  "serviceDesk",
  "purchaseOrders",
  "team",
  "tasks",
]);

function mergeEntity(fileName, key, backupRows, idKey, currentDoc) {
  const list = Array.isArray(currentDoc[key]) ? currentDoc[key] : [];
  const idx = indexBy(list, (r) => r && r[idKey]);
  let imported = 0;
  let skipped = 0;
  const dups = [];
  for (const row of Array.isArray(backupRows) ? backupRows : []) {
    if (!row || !row[idKey]) continue;
    const id = String(row[idKey]);
    if (idx.has(id)) {
      skipped += 1;
      dups.push(id);
    } else {
      list.push(row);
      idx.set(id, row);
      imported += 1;
    }
  }
  const next = { ...currentDoc, [key]: list };
  writeJson(path.join(process.cwd(), "data", fileName), next);
  return { imported, skipped, dups };
}

function restoreBackup(filePath, mode, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const safe = resolveSafePath(filePath);
  if (!safe) {
    return {
      mode,
      success: false,
      importedCounts: {},
      skippedCounts: {},
      duplicateWarnings: [],
      errors: ["invalid_or_unsafe_file_path"],
    };
  }

  const val = validateBackupFile(safe);
  if (!val.valid) {
    return {
      mode,
      success: false,
      errors: val.blockingIssues,
      duplicateWarnings: val.warnings,
    };
  }

  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(safe, "utf8") || "{}");
  } catch (e) {
    return { mode, success: false, errors: [e && e.message ? e.message : "read_failed"] };
  }

  const d = doc.data && typeof doc.data === "object" ? doc.data : {};

  if (mode === "PREVIEW") {
    return previewRestore(safe);
  }

  if (mode === "MERGE") {
    const importedCounts = {};
    const skippedCounts = {};
    const duplicateWarnings = [];

    const jobsDoc = readJson(path.join(process.cwd(), "data", "cheeky-jobs.json"), { jobs: [] });
    const rj = mergeEntity("cheeky-jobs.json", "jobs", d.jobs, "jobId", jobsDoc);
    importedCounts.jobs = rj.imported;
    skippedCounts.jobs = rj.skipped;
    duplicateWarnings.push(...rj.dups.slice(0, 50).map((id) => `dup_job:${id}`));

    const custDoc = readJson(path.join(process.cwd(), "data", "customers.json"), { customers: [] });
    const listC = Array.isArray(custDoc.customers) ? custDoc.customers : [];
    const cIdx = indexBy(listC, (r) => r && (r.id || r.email));
    let ic = 0;
    let sc = 0;
    for (const c of Array.isArray(d.customers) ? d.customers : []) {
      const k = c && (c.id || c.email);
      if (!k) continue;
      if (cIdx.has(String(k))) {
        sc += 1;
      } else {
        listC.push(c);
        cIdx.set(String(k), c);
        ic += 1;
      }
    }
    writeJson(path.join(process.cwd(), "data", "customers.json"), { customers: listC });
    importedCounts.customers = ic;
    skippedCounts.customers = sc;

    const intDoc = readJson(path.join(process.cwd(), "data", "intake-records.json"), { records: [] });
    const ri = mergeEntity("intake-records.json", "records", d.intakeRecords, "id", intDoc);
    importedCounts.intakeRecords = ri.imported;
    skippedCounts.intakeRecords = ri.skipped;

    const commDoc = readJson(path.join(process.cwd(), "data", "communications.json"), { communications: [] });
    const rco = mergeEntity("communications.json", "communications", d.communications, "id", commDoc);
    importedCounts.communications = rco.imported;
    skippedCounts.communications = rco.skipped;

    const sdDoc = readJson(path.join(process.cwd(), "data", "service-desk-items.json"), { items: [] });
    const rsd = mergeEntity("service-desk-items.json", "items", d.serviceDeskItems, "id", sdDoc);
    importedCounts.serviceDeskItems = rsd.imported;
    skippedCounts.serviceDeskItems = rsd.skipped;

    const poDoc = readJson(path.join(process.cwd(), "data", "purchase-orders.json"), { orders: [] });
    const listPo = Array.isArray(poDoc.orders) ? poDoc.orders : [];
    const poIdx = indexBy(listPo, (r) => r && r.poNumber);
    let ipo = 0;
    let spo = 0;
    for (const r of Array.isArray(d.purchaseOrders) ? d.purchaseOrders : []) {
      if (!r || !r.poNumber) continue;
      const k = String(r.poNumber);
      if (poIdx.has(k)) spo += 1;
      else {
        listPo.push(r);
        poIdx.set(k, r);
        ipo += 1;
      }
    }
    writeJson(path.join(process.cwd(), "data", "purchase-orders.json"), { orders: listPo });
    importedCounts.purchaseOrders = ipo;
    skippedCounts.purchaseOrders = spo;

    const teamDoc = readJson(path.join(process.cwd(), "data", "team.json"), { members: [] });
    const rtm = mergeEntity("team.json", "members", d.teamMembers, "id", teamDoc);
    importedCounts.teamMembers = rtm.imported;
    skippedCounts.teamMembers = rtm.skipped;

    const taskDoc = readJson(path.join(process.cwd(), "data", "team-execution.json"), {
      version: 1,
      assignments: [],
      completedToday: [],
      jobFlags: {},
    });
    const bt = d.tasks && typeof d.tasks === "object" ? d.tasks : {};
    const assigns = Array.isArray(taskDoc.assignments) ? taskDoc.assignments : [];
    const aIdx = indexBy(assigns, (r) => r && r.taskId);
    let ia = 0;
    let sa = 0;
    for (const r of Array.isArray(bt.assignments) ? bt.assignments : []) {
      if (!r || !r.taskId) continue;
      if (aIdx.has(String(r.taskId))) sa += 1;
      else {
        assigns.push(r);
        aIdx.set(String(r.taskId), r);
        ia += 1;
      }
    }
    taskDoc.assignments = assigns;
    if (bt.jobFlags && typeof bt.jobFlags === "object") {
      taskDoc.jobFlags = { ...taskDoc.jobFlags, ...bt.jobFlags };
    }
    writeJson(path.join(process.cwd(), "data", "team-execution.json"), taskDoc);
    importedCounts.taskAssignments = ia;
    skippedCounts.taskAssignments = sa;

    return {
      mode: "MERGE",
      success: true,
      importedCounts,
      skippedCounts,
      duplicateWarnings,
      errors: [],
    };
  }

  if (mode === "REPLACE_SELECTED") {
    const groups = Array.isArray(o.groups) ? o.groups.map((g) => String(g).trim()) : [];
    const bad = groups.filter((g) => !ALLOWED_GROUPS.has(g));
    if (bad.length) {
      return {
        mode,
        success: false,
        errors: [`unknown_groups:${bad.join(",")}`],
        importedCounts: {},
        skippedCounts: {},
        duplicateWarnings: [],
      };
    }
    if (!groups.length) {
      return {
        mode,
        success: false,
        errors: ["groups_required_for_REPLACE_SELECTED"],
        importedCounts: {},
        skippedCounts: {},
        duplicateWarnings: [],
      };
    }

    const importedCounts = {};
    const errors = [];

    try {
      if (groups.includes("jobs")) {
        writeJson(path.join(process.cwd(), "data", "cheeky-jobs.json"), {
          jobs: Array.isArray(d.jobs) ? d.jobs : [],
        });
        importedCounts.jobs = Array.isArray(d.jobs) ? d.jobs.length : 0;
      }
      if (groups.includes("customers")) {
        writeJson(path.join(process.cwd(), "data", "customers.json"), {
          customers: Array.isArray(d.customers) ? d.customers : [],
        });
        importedCounts.customers = Array.isArray(d.customers) ? d.customers.length : 0;
      }
      if (groups.includes("intake")) {
        writeJson(path.join(process.cwd(), "data", "intake-records.json"), {
          records: Array.isArray(d.intakeRecords) ? d.intakeRecords : [],
        });
        importedCounts.intakeRecords = Array.isArray(d.intakeRecords) ? d.intakeRecords.length : 0;
      }
      if (groups.includes("communications")) {
        writeJson(path.join(process.cwd(), "data", "communications.json"), {
          communications: Array.isArray(d.communications) ? d.communications : [],
        });
        importedCounts.communications = Array.isArray(d.communications) ? d.communications.length : 0;
      }
      if (groups.includes("serviceDesk")) {
        writeJson(path.join(process.cwd(), "data", "service-desk-items.json"), {
          items: Array.isArray(d.serviceDeskItems) ? d.serviceDeskItems : [],
        });
        importedCounts.serviceDeskItems = Array.isArray(d.serviceDeskItems) ? d.serviceDeskItems.length : 0;
      }
      if (groups.includes("purchaseOrders")) {
        writeJson(path.join(process.cwd(), "data", "purchase-orders.json"), {
          orders: Array.isArray(d.purchaseOrders) ? d.purchaseOrders : [],
        });
        importedCounts.purchaseOrders = Array.isArray(d.purchaseOrders) ? d.purchaseOrders.length : 0;
      }
      if (groups.includes("team")) {
        writeJson(path.join(process.cwd(), "data", "team.json"), {
          members: Array.isArray(d.teamMembers) ? d.teamMembers : [],
        });
        importedCounts.teamMembers = Array.isArray(d.teamMembers) ? d.teamMembers.length : 0;
      }
      if (groups.includes("tasks")) {
        const t = d.tasks && typeof d.tasks === "object" ? d.tasks : {};
        writeJson(path.join(process.cwd(), "data", "team-execution.json"), {
          version: t.version || 1,
          assignments: Array.isArray(t.assignments) ? t.assignments : [],
          completedToday: Array.isArray(t.completedToday) ? t.completedToday : [],
          jobFlags: t.jobFlags && typeof t.jobFlags === "object" ? t.jobFlags : {},
        });
        importedCounts.tasks = Array.isArray(t.assignments) ? t.assignments.length : 0;
      }
    } catch (e) {
      errors.push(e && e.message ? e.message : "write_failed");
      return {
        mode,
        success: false,
        importedCounts,
        skippedCounts: {},
        duplicateWarnings: [],
        errors,
      };
    }

    return {
      mode: "REPLACE_SELECTED",
      success: errors.length === 0,
      importedCounts,
      skippedCounts: {},
      duplicateWarnings: [],
      errors,
    };
  }

  return {
    mode,
    success: false,
    errors: ["unsupported_mode"],
    importedCounts: {},
    skippedCounts: {},
    duplicateWarnings: [],
  };
}

module.exports = {
  previewRestore,
  restoreBackup,
  resolveSafePath,
};
