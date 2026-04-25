/**
 * Persistent adoption / onboarding state — separate from business records.
 */
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "adoption-state.json");

const DEFAULT = {
  version: 1,
  setupStepsCompleted: {},
  trainingMode: false,
  demoSeedVersion: 0,
  onboardingCompletedAt: null,
  lastGuideViewed: {},
  /** BUILD | TRAINING | STAGING | LIVE */
  globalOperationalMode: "BUILD",
  subsystemModes: {},
  lastGoLiveReadinessAt: null,
};

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE)) {
      fs.writeFileSync(FILE, JSON.stringify(DEFAULT, null, 2), "utf8");
    }
  } catch (_e) {
    /* ignore */
  }
}

function load() {
  ensureFile();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8") || "{}");
    return { ...DEFAULT, ...(raw && typeof raw === "object" ? raw : {}) };
  } catch (_e) {
    return { ...DEFAULT };
  }
}

function save(partial) {
  ensureFile();
  const cur = load();
  const next = { ...cur, ...(partial && typeof partial === "object" ? partial : {}) };
  try {
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2), "utf8");
  } catch (e) {
    console.warn("[adoptionStateStore] save failed:", e && e.message ? e.message : e);
  }
  return next;
}

function markStep(key, done = true) {
  const cur = load();
  const setupStepsCompleted = { ...(cur.setupStepsCompleted || {}) };
  setupStepsCompleted[String(key)] = !!done;
  return save({ setupStepsCompleted });
}

module.exports = {
  load,
  save,
  markStep,
  DEFAULT,
};
