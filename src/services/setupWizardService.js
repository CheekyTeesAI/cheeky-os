/**
 * Idempotent setup checklist + SAFE initial file bootstrap.
 */
const fs = require("fs");
const path = require("path");
const adoptionStateStore = require("./adoptionStateStore");
const { logAdoptionEvent } = require("./adoptionEventLog");
const { getFirstRunStatus } = require("./firstRunService");

const DATA_DIR = path.join(process.cwd(), "data");

const STEP_DEFS = [
  {
    key: "roles",
    title: "Default roles",
    description: "Ensure team members have OWNER / PRINTER / ADMIN / DESIGN roles where needed.",
    action: "POST /setup/run with mode SAFE (idempotent)",
  },
  {
    key: "team",
    title: "Team roster",
    description: "Create default team members if data/team.json is empty.",
    action: "POST /setup/run",
  },
  {
    key: "vendor_profiles",
    title: "Vendor profiles",
    description: "Document vendor keys; emails come from environment variables.",
    action: "GET /system/health — verify env",
  },
  {
    key: "communication_policy",
    description: "Communication caps and preview-first behavior.",
    title: "Communication policy file",
    action: "POST /setup/run",
  },
  {
    key: "automation_config",
    title: "Automation config",
    description: "Initialize automation-state.json (paused=false, rules merge with defaults).",
    action: "POST /setup/run",
  },
  {
    key: "sample_data",
    title: "Sample data (optional)",
    description: "Demo jobs / desk items — only via explicit POST /setup/demo/seed.",
    action: "POST /setup/demo/seed",
  },
  {
    key: "health_check",
    title: "Validate system health",
    description: "Run health snapshot after setup.",
    action: "GET /control-tower or GET /system/health",
  },
];

function readTeamFile() {
  const p = path.join(DATA_DIR, "team.json");
  try {
    if (!fs.existsSync(p)) return { members: [] };
    const j = JSON.parse(fs.readFileSync(p, "utf8") || "{}");
    return { members: Array.isArray(j.members) ? j.members : [] };
  } catch (_e) {
    return { members: [] };
  }
}

function writeTeamDefaultIfEmpty() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const p = path.join(DATA_DIR, "team.json");
  const cur = readTeamFile();
  if (cur.members.length > 0) return { created: false, path: p };
  const doc = {
    members: [
      { id: "owner-1", name: "Owner", role: "OWNER", active: true },
      { id: "printer-1", name: "Printer", role: "PRINTER", active: true },
      { id: "admin-1", name: "Admin", role: "ADMIN", active: true },
    ],
  };
  fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf8");
  return { created: true, path: p };
}

function writeCommunicationPolicyIfMissing() {
  const p = path.join(DATA_DIR, "communication-policy.json");
  if (fs.existsSync(p)) return { created: false, path: p };
  const doc = {
    version: 1,
    previewFirst: true,
    maxOutboundPerDay: 80,
    notes: "Safe defaults — adjust for production.",
  };
  fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf8");
  return { created: true, path: p };
}

function writeAutomationStateIfMissing() {
  const p = path.join(DATA_DIR, "automation-state.json");
  if (fs.existsSync(p)) return { created: false, path: p };
  const doc = { paused: false, rules: { dryRun: false } };
  fs.writeFileSync(p, JSON.stringify(doc, null, 2), "utf8");
  return { created: true, path: p };
}

function buildSetupChecklist() {
  const completed = adoptionStateStore.load().setupStepsCompleted || {};
  const steps = STEP_DEFS.map((d) => ({
    key: d.key,
    title: d.title,
    description: d.description,
    completed: !!completed[d.key],
    action: d.action,
  }));
  return { steps, completedKeys: Object.keys(completed).filter((k) => completed[k]) };
}

function markSetupStepComplete(stepKey) {
  adoptionStateStore.markStep(stepKey, true);
  logAdoptionEvent("setup_step_complete", { stepKey });
  return { ok: true, stepKey };
}

/**
 * @param {{ mode?: string }} opts
 */
async function runInitialSetup(opts) {
  const mode = String((opts && opts.mode) || "SAFE").toUpperCase();
  const results = [];

  const team = writeTeamDefaultIfEmpty();
  results.push({ step: "team", ...team });
  if (team.created) adoptionStateStore.markStep("team", true);

  const pol = writeCommunicationPolicyIfMissing();
  results.push({ step: "communication_policy", ...pol });
  if (pol.created) adoptionStateStore.markStep("communication_policy", true);

  const aut = writeAutomationStateIfMissing();
  results.push({ step: "automation_config", ...aut });
  if (aut.created) adoptionStateStore.markStep("automation_config", true);

  adoptionStateStore.markStep("roles", true);
  adoptionStateStore.markStep("vendor_profiles", true);

  let health = null;
  try {
    const { getSystemHealthReport } = require("./systemEngine");
    health = getSystemHealthReport(null);
  } catch (_e) {
    health = { status: "UNKNOWN" };
  }

  if (mode === "SAFE") {
    adoptionStateStore.markStep("health_check", true);
  }

  logAdoptionEvent("setup_run", { mode, results: results.map((r) => r.step) });

  const first = await getFirstRunStatus();
  return {
    ok: true,
    mode,
    results,
    healthSnapshot: health,
    firstRunAfter: first,
  };
}

module.exports = {
  buildSetupChecklist,
  runInitialSetup,
  markSetupStepComplete,
  STEP_DEFS,
};
