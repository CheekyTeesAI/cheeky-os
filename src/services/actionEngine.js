function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSignal(signal) {
  const item = signal && typeof signal === "object" ? signal : {};
  const value = Math.max(0, toNumber(item.value, toNumber(item.amount_owed, 0)));
  const urgency = Math.max(0, toNumber(item.urgency, toNumber(item.days_overdue, 0)));
  const score = Math.round((value / 100) * Math.max(1, urgency));
  let actionType = "NONE";
  if (score > 80) actionType = "CALL";
  else if (score >= 50) actionType = "TEXT";
  else if (score >= 20) actionType = "EMAIL";

  return {
    id: item.id || `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: item.source || "unknown",
    customer: item.customer || item.customer_name || "Unknown Customer",
    summary: item.summary || item.reason || "No summary",
    value,
    urgency,
    score,
    action_type: actionType,
    raw: item,
  };
}

function scoreAndRank(signals) {
  try {
    const list = Array.isArray(signals) ? signals : [];
    const ranked = list.map(normalizeSignal).sort((a, b) => b.score - a.score);
    return {
      success: true,
      total: ranked.length,
      queue: ranked,
    };
  } catch (error) {
    console.error("[actionEngine] scoreAndRank failed:", error && error.message ? error.message : error);
    return {
      success: false,
      total: 0,
      queue: [],
      error: error && error.message ? error.message : "action engine error",
    };
  }
}

function isDueToday(dueDate) {
  const t = new Date(dueDate).getTime();
  if (!Number.isFinite(t)) return false;
  const s = new Date();
  s.setHours(0, 0, 0, 0);
  const e = new Date();
  e.setHours(23, 59, 59, 999);
  return t >= s.getTime() && t <= e.getTime();
}

function hasArt(job) {
  if (!job) return false;
  if (Array.isArray(job.artFiles) && job.artFiles.length > 0) return true;
  if (job.artReady === true) return true;
  return false;
}

function actionForJob(job) {
  const status = String(job && job.status ? job.status : "").toUpperCase();
  if (status === "OVERDUE") return { action: "COLLECT", priority: 100 };
  if (status === "PAID") return { action: "NONE", priority: 5 };
  if (isDueToday(job && job.dueDate)) {
    if (!hasArt(job)) return { action: "ART REQUIRED", priority: 90 };
    return { action: "PRINT", priority: 80 };
  }
  if (!hasArt(job) && status !== "PAID") return { action: "ART REQUIRED", priority: 70 };
  if (status === "UNPAID") return { action: "REVIEW", priority: 40 };
  return { action: "REVIEW", priority: 20 };
}

function generateActions(jobs) {
  try {
    const list = Array.isArray(jobs) ? jobs : [];
    const actions = list.map((job) => {
      const decision = actionForJob(job);
      return {
        jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
        customer: job && job.customer ? job.customer : "Unknown Customer",
        action: decision.action,
        priority: decision.priority,
        dueDate: job && job.dueDate ? job.dueDate : null,
        status: job && job.status ? job.status : "UNPAID",
      };
    });
    actions.sort((a, b) => b.priority - a.priority);
    return actions;
  } catch (error) {
    console.error("[actionEngine] generateActions failed:", error && error.message ? error.message : error);
    return [];
  }
}

module.exports = {
  scoreAndRank,
  generateActions,
};
