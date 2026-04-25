function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function daysFromNow(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const start = startOfToday();
  return Math.floor((t - start) / (24 * 60 * 60 * 1000));
}

function hasArtFlag(job) {
  if (!job) return false;
  if (job.hasArt === true) return true;
  if (Array.isArray(job.artFiles) && job.artFiles.length > 0) return true;
  if (job.artReady === true) return true;
  return false;
}

function isSimpleJob(job) {
  if (!job) return false;
  const items = Array.isArray(job.lineItems) ? job.lineItems : [];
  if (items.length === 1) return true;
  if (items.length === 0 && Number(job.amount || 0) > 0) return true;
  return false;
}

function calculatePriority(job) {
  try {
    if (!job) return 0;
    let score = 0;
    const status = String(job.status || "").toUpperCase();
    const t = new Date(job.dueDate).getTime();
    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    if (Number.isFinite(t)) {
      if (t >= todayStart && t <= todayEnd) score += 50;
      if (t < todayStart && status !== "PAID") score += 40;
      const days = daysFromNow(job.dueDate);
      if (days !== null && days > 0 && days <= 2) score += 30;
    }
    if (status === "OVERDUE") score += 40;

    if (hasArtFlag(job)) score += 20;
    else score -= 20;

    if (isSimpleJob(job)) score += 10;

    if (status === "PAID") score -= 100;

    return score;
  } catch (error) {
    console.error("[priorityEngine] calculatePriority failed:", error && error.message ? error.message : error);
    return 0;
  }
}

module.exports = {
  calculatePriority,
  hasArtFlag,
};
