const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "cheeky-jobs.json");

const memory = {
  jobs: new Map(),
  loaded: false,
};

function ensureFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify({ jobs: [] }, null, 2), "utf8");
  } catch (error) {
    console.warn("[store] ensureFile failed:", error && error.message ? error.message : error);
  }
}

function loadOnce() {
  if (memory.loaded) return;
  ensureFile();
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const list = Array.isArray(parsed && parsed.jobs) ? parsed.jobs : [];
    for (const job of list) {
      if (job && job.jobId) memory.jobs.set(job.jobId, job);
    }
  } catch (error) {
    console.warn("[store] load failed (continuing empty):", error && error.message ? error.message : error);
  } finally {
    memory.loaded = true;
  }
}

function persist() {
  ensureFile();
  const snapshot = { jobs: Array.from(memory.jobs.values()) };
  Promise.resolve()
    .then(() => {
      try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(snapshot, null, 2), "utf8");
      } catch (error) {
        console.warn("[store] persist failed:", error && error.message ? error.message : error);
      }
    })
    .catch((error) => {
      console.warn("[store] persist async failed:", error && error.message ? error.message : error);
    });
}

function makeJobId(seed) {
  if (seed) return `JOB-${seed}`;
  return `JOB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function saveJob(job) {
  loadOnce();
  const input = job && typeof job === "object" ? job : {};
  const jobId = input.jobId || makeJobId(input.sourceInvoiceId || input.id);
  const nowIso = new Date().toISOString();
  const existing = memory.jobs.get(jobId) || {};
  const mergedArtFiles = Array.isArray(input.artFiles) && input.artFiles.length > 0
    ? input.artFiles
    : (Array.isArray(existing.artFiles) ? existing.artFiles : []);
  const mergedHasArt = Boolean(
    input.hasArt === true
      || existing.hasArt === true
      || input.artReady === true
      || existing.artReady === true
      || mergedArtFiles.length > 0,
  );
  const merged = {
    ...existing,
    ...input,
    jobId,
    status: input.status || existing.status || "UNPAID",
    productionType: input.productionType || existing.productionType || "UNKNOWN",
    lineItems: Array.isArray(input.lineItems) ? input.lineItems : existing.lineItems || [],
    notes: input.notes || existing.notes || "",
    artFiles: mergedArtFiles,
    hasArt: mergedHasArt,
    createdAt: existing.createdAt || input.createdAt || nowIso,
    updatedAt: nowIso,
  };
  memory.jobs.set(jobId, merged);
  persist();
  console.log("[store] JOB CREATED:", jobId, merged.customer || "(no customer)");
  return merged;
}

function getJobs() {
  loadOnce();
  return Array.from(memory.jobs.values());
}

function getJobById(id) {
  loadOnce();
  if (!id) return null;
  return memory.jobs.get(id) || null;
}

function updateJob(id, updates) {
  loadOnce();
  if (!id) return null;
  const existing = memory.jobs.get(id);
  if (!existing) return null;
  const merged = {
    ...existing,
    ...(updates && typeof updates === "object" ? updates : {}),
    jobId: id,
    updatedAt: new Date().toISOString(),
  };
  memory.jobs.set(id, merged);
  persist();
  return merged;
}

function upsertJobs(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const saved = [];
  for (const job of list) saved.push(saveJob(job));
  return saved;
}

function clearAll() {
  memory.jobs.clear();
  persist();
}

/** Remove a job only if marked demo (safety). */
function deleteJobIfDemo(jobId) {
  loadOnce();
  const id = String(jobId || "").trim();
  if (!id) return false;
  const j = memory.jobs.get(id);
  if (!j) return false;
  const demo = j.isDemo === true || /^DEMO-/i.test(id);
  if (!demo) return false;
  memory.jobs.delete(id);
  persist();
  return true;
}

module.exports = {
  saveJob,
  getJobs,
  getJobById,
  updateJob,
  upsertJobs,
  clearAll,
  deleteJobIfDemo,
};
