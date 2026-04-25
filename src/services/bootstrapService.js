/**
 * Idempotent bootstrap for fresh / recovered environments.
 */
const fs = require("fs");
const path = require("path");
const { ensureDirectories } = require("../utils/ensureDirectories");
const { DEFAULT_RULES } = require("../config/automationRules");

const SHOP_PROFILE = {
  name: "Cheeky Tees",
  addressLine1: "104 Trade Street",
  city: "Fountain Inn",
  state: "SC",
  postalCode: "29644",
  country: "US",
  phone: String(process.env.CHEEKY_SHOP_PHONE || "").trim() || null,
  email: String(process.env.CHEEKY_SHOP_EMAIL || "").trim() || null,
};

function bootstrapSystem() {
  const created = [];
  const skipped = [];
  const warnings = [];

  const dirResult = ensureDirectories();
  created.push(...dirResult.created.map((r) => `dir:${r}`));

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const shopPath = path.join(dataDir, "shop-profile.json");
  if (!fs.existsSync(shopPath)) {
    fs.writeFileSync(shopPath, JSON.stringify(SHOP_PROFILE, null, 2), "utf8");
    created.push("shop-profile.json");
  } else {
    skipped.push("shop-profile.json");
  }

  const teamPath = path.join(dataDir, "team.json");
  if (!fs.existsSync(teamPath)) {
    const { DEFAULT_MEMBERS } = require("./teamService");
    fs.writeFileSync(teamPath, JSON.stringify({ members: DEFAULT_MEMBERS }, null, 2), "utf8");
    created.push("team.json");
  } else {
    skipped.push("team.json");
  }

  const autoPath = path.join(dataDir, "automation-state.json");
  if (!fs.existsSync(autoPath)) {
    fs.writeFileSync(
      autoPath,
      JSON.stringify({ paused: false, rules: { ...DEFAULT_RULES } }, null, 2),
      "utf8"
    );
    created.push("automation-state.json");
  } else {
    skipped.push("automation-state.json");
  }

  const policyPath = path.join(dataDir, "communication-policy.json");
  if (!fs.existsSync(policyPath)) {
    fs.writeFileSync(
      policyPath,
      JSON.stringify({ version: 1, autoSafeOnly: true, notes: "Safe-by-default outbound policy" }, null, 2),
      "utf8"
    );
    created.push("communication-policy.json");
  } else {
    skipped.push("communication-policy.json");
  }

  const sysCtrlPath = path.join(dataDir, "system-control.json");
  try {
    if (!fs.existsSync(sysCtrlPath)) {
      const ctrl = require("./systemControlService");
      ctrl.resumeSystem({ userId: "bootstrap" });
      created.push("system-control.json");
    } else {
      skipped.push("system-control.json");
    }
  } catch (e) {
    warnings.push(`system_control: ${e && e.message ? e.message : "skip"}`);
  }

  try {
    require("../data/store").getJobs();
    skipped.push("jobs-store-touched");
  } catch (e) {
    warnings.push(`jobs_store: ${e && e.message ? e.message : "err"}`);
  }

  return {
    created,
    skipped,
    warnings,
  };
}

module.exports = {
  bootstrapSystem,
  SHOP_PROFILE,
};
