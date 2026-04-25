const { getJobs } = require("../data/store");
const { listFoundationJobsAsLegacy } = require("./foundationJobService");
const { isFoundationDbAvailable } = require("./foundationPrisma");

/**
 * Merge foundation DB jobs (source of truth when present) with legacy JSON store jobs.
 * DB wins on jobKey collision; store-only keys remain for invoice / mock flows.
 */
async function getOperatingSystemJobs() {
  const store = getJobs();
  if (!isFoundationDbAvailable()) {
    return store;
  }
  try {
    const dbJobs = await listFoundationJobsAsLegacy();
    const dbMap = new Map(dbJobs.map((j) => [j.jobId, j]));
    const out = [];
    for (const j of dbJobs) out.push(j);
    for (const j of store) {
      if (!dbMap.has(j.jobId)) out.push(j);
    }
    return out;
  } catch (e) {
    console.warn("[foundationJobMerge] falling back to store:", e && e.message ? e.message : e);
    return store;
  }
}

module.exports = { getOperatingSystemJobs };
