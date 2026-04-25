/**
 * First-run detection — reads existing files; additive only.
 */
const fs = require("fs");
const path = require("path");
const adoptionStateStore = require("./adoptionStateStore");

function loadAdoption() {
  try {
    return adoptionStateStore.load();
  } catch (_e) {
    return {};
  }
}
const { getVendorProfiles } = require("./vendorProfileService");
const { getJobs } = require("../data/store");

const DATA_DIR = path.join(process.cwd(), "data");

function fileExists(rel) {
  try {
    return fs.existsSync(path.join(DATA_DIR, rel));
  } catch (_e) {
    return false;
  }
}

function readTeam() {
  try {
    const p = path.join(DATA_DIR, "team.json");
    if (!fs.existsSync(p)) return { members: [] };
    const j = JSON.parse(fs.readFileSync(p, "utf8") || "{}");
    return { members: Array.isArray(j.members) ? j.members : [] };
  } catch (_e) {
    return { members: [] };
  }
}

function countDemoJobs() {
  try {
    return getJobs().filter((j) => j && (j.isDemo === true || String(j.jobId || "").startsWith("DEMO-"))).length;
  } catch (_e) {
    return 0;
  }
}

function hasVendorEmailConfigured() {
  const { vendors } = getVendorProfiles();
  return (vendors || []).some((v) => v && String(v.email || "").trim().length > 0);
}

/**
 * @returns {Promise<{
 *   isFirstRun: boolean,
 *   missingCoreSetup: string[],
 *   recommendedSetupSteps: string[],
 *   hasDemoData: boolean
 * }>}
 */
async function getFirstRunStatus() {
  const missingCoreSetup = [];
  const recommendedSetupSteps = [];

  const team = readTeam();
  const activeMembers = team.members.filter((m) => m && m.active !== false);
  if (activeMembers.length === 0) {
    missingCoreSetup.push("team_members");
    recommendedSetupSteps.push("Add at least one active team member in data/team.json (or run setup).");
  }

  const rolesSeen = new Set(
    activeMembers.map((m) => String(m.role || "").toUpperCase()).filter(Boolean),
  );
  const needRoles = ["OWNER", "PRINTER", "ADMIN", "DESIGN"].filter((r) => !rolesSeen.has(r));
  if (rolesSeen.size === 0 && activeMembers.length > 0) {
    missingCoreSetup.push("roles");
    recommendedSetupSteps.push("Assign roles (OWNER, PRINTER, ADMIN, DESIGN) to team members.");
  } else if (needRoles.length === 4 && activeMembers.length > 0) {
    missingCoreSetup.push("roles");
    recommendedSetupSteps.push("Define role coverage so boards and permissions map correctly.");
  }

  if (!fileExists("communication-policy.json")) {
    missingCoreSetup.push("communication_policy_file");
    recommendedSetupSteps.push("Create data/communication-policy.json (or run setup wizard).");
  }

  if (!fileExists("automation-state.json")) {
    missingCoreSetup.push("automation_config");
    recommendedSetupSteps.push("Initialize automation state (SAFE mode defaults dry-run friendly).");
  }

  if (!hasVendorEmailConfigured()) {
    missingCoreSetup.push("vendor_email_env");
    recommendedSetupSteps.push("Set vendor supplier emails in env (e.g. CAROLINA_MADE_EMAIL) for live PO email.");
  }

  if (!fileExists("intake-records.json") && !fileExists("cheeky-jobs.json")) {
    missingCoreSetup.push("data_store");
    recommendedSetupSteps.push("Ensure data/ exists with core JSON stores (created on first write).");
  }

  const demoJobs = countDemoJobs();
  const st = loadAdoption();
  const hasDemoData = demoJobs > 0 || Number(st.demoSeedVersion || 0) > 0;

  if (demoJobs === 0 && !hasDemoData) {
    recommendedSetupSteps.push("Optional: seed demo data from POST /setup/demo/seed for training.");
  }

  const onboardingDone = Boolean(st.onboardingCompletedAt);
  const isFirstRun = !onboardingDone && missingCoreSetup.length > 0;

  return {
    isFirstRun,
    missingCoreSetup,
    recommendedSetupSteps,
    hasDemoData,
  };
}

module.exports = { getFirstRunStatus };
