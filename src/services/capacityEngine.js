/**
 * Shop capacity assumptions for week planning (override via env when needed).
 */

function numEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function getDailyCapacity() {
  return {
    dtgHoursPerDay: numEnv("CAPACITY_DTG_HOURS", 6),
    dtfHoursPerDay: numEnv("CAPACITY_DTF_HOURS", 4),
    screenHoursPerDay: numEnv("CAPACITY_SCREEN_HOURS", 6),
    embroideryHoursPerDay: numEnv("CAPACITY_EMBROIDERY_HOURS", 2),
    maxJobsPerDay: numEnv("CAPACITY_MAX_JOBS_PER_DAY", 8),
    assumptions: [
      "Default hours are planning estimates; override with CAPACITY_* env vars.",
      "maxJobsPerDay caps assignments even if hours remain.",
    ],
  };
}

module.exports = {
  getDailyCapacity,
};
