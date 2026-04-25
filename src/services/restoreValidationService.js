/**
 * Validate backup file before any restore — read-only.
 */
const fs = require("fs");
const path = require("path");
const { SCHEMA_VERSION } = require("./backupService");

function validateBackupFile(filePath) {
  const warnings = [];
  const blockingIssues = [];
  let parsed = null;

  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    return {
      valid: false,
      version: null,
      counts: {},
      warnings: [],
      blockingIssues: [`file_not_found: ${filePath}`],
      restoreModeOptions: ["PREVIEW", "MERGE", "REPLACE_SELECTED"],
    };
  }

  try {
    parsed = JSON.parse(fs.readFileSync(abs, "utf8") || "{}");
  } catch (e) {
    blockingIssues.push(`invalid_json: ${e && e.message ? e.message : "parse_error"}`);
    return {
      valid: false,
      version: null,
      counts: {},
      warnings,
      blockingIssues,
      restoreModeOptions: ["PREVIEW", "MERGE", "REPLACE_SELECTED"],
    };
  }

  const top = ["schemaVersion", "data", "createdAt"];
  for (const k of top) {
    if (parsed[k] === undefined && k !== "schemaVersion") {
      warnings.push(`missing_recommended_key:${k}`);
    }
  }
  if (!parsed.data || typeof parsed.data !== "object") {
    blockingIssues.push("missing_data_object");
  }

  const sv = Number(parsed.schemaVersion);
  if (Number.isFinite(sv) && sv > SCHEMA_VERSION) {
    blockingIssues.push(`backup_schema_newer_than_engine (${sv} > ${SCHEMA_VERSION})`);
  } else if (!Number.isFinite(sv)) {
    warnings.push("schemaVersion_missing_or_invalid");
  }

  const d = parsed.data && typeof parsed.data === "object" ? parsed.data : {};
  const counts = {
    jobs: Array.isArray(d.jobs) ? d.jobs.length : 0,
    customers: Array.isArray(d.customers) ? d.customers.length : 0,
    intakeRecords: Array.isArray(d.intakeRecords) ? d.intakeRecords.length : 0,
    communications: Array.isArray(d.communications) ? d.communications.length : 0,
    serviceDeskItems: Array.isArray(d.serviceDeskItems) ? d.serviceDeskItems.length : 0,
    purchaseOrders: Array.isArray(d.purchaseOrders) ? d.purchaseOrders.length : 0,
    teamMembers: Array.isArray(d.teamMembers) ? d.teamMembers.length : 0,
    tasksAssignments: d.tasks && Array.isArray(d.tasks.assignments) ? d.tasks.assignments.length : 0,
  };

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    warnings.push("backup_contains_no_entity_rows");
  }

  const valid = blockingIssues.length === 0;

  return {
    valid,
    version: Number.isFinite(sv) ? sv : null,
    counts,
    warnings,
    blockingIssues,
    restoreModeOptions: ["PREVIEW", "MERGE", "REPLACE_SELECTED"],
  };
}

module.exports = {
  validateBackupFile,
};
