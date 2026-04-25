/**
 * Priority scoring for scheduling (finance + effort + routing + readiness).
 */
const { calculatePrice } = require("./pricingEngine");

function daysUntilDue(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.floor((t - start.getTime()) / 86400000);
}

function scoreJobPriority(job, ctx) {
  const finance = ctx && ctx.finance ? ctx.finance : calculatePrice(job);
  const effort = ctx && ctx.effort ? ctx.effort : { totalMinutes: 60, effortClass: "MEDIUM" };
  const routing = ctx && ctx.routing ? ctx.routing : { route: "IN_HOUSE", reason: "", confidence: 0.7 };
  const readiness = ctx && ctx.readiness ? ctx.readiness : { ready: true, blockedReasons: [] };

  const reasons = [];
  let score = 50;

  const dueDays = daysUntilDue(job && job.dueDate);
  if (dueDays != null) {
    if (dueDays < 0) {
      score += 80;
      reasons.push("overdue");
    } else if (dueDays <= 2) {
      score += 45;
      reasons.push("due within 2 days");
    } else if (dueDays <= 5) {
      score += 22;
      reasons.push("due this week");
    }
  } else {
    reasons.push("no due date — urgency assumed low");
    score -= 5;
  }

  if (job && job.depositPaid === true) {
    score += 15;
    reasons.push("deposit paid");
  } else if (job && job.depositPaid === false) {
    score -= 60;
    reasons.push("deposit missing — penalized");
  }

  if (readiness.ready) {
    score += 10;
    reasons.push("ready gates passed");
  } else {
    score -= 50;
    reasons.push(`blocked: ${(readiness.blockedReasons || []).join(", ")}`);
  }

  const profit = Number(finance.profit) || 0;
  const margin = Number(finance.marginPercent) || 0;
  score += Math.min(35, Math.max(-10, profit / 25));
  score += Math.min(15, margin / 5);
  if (profit > 200) reasons.push("strong profit dollars");
  if (margin > 40) reasons.push("healthy margin");

  const tm = Number(effort.totalMinutes) || 60;
  if (effort.effortClass === "LIGHT") score += 12;
  if (effort.effortClass === "HEAVY") score -= 12;
  score -= Math.min(25, Math.max(0, (tm - 60) / 8));
  if (profit > 150 && effort.effortClass === "LIGHT") {
    score += 18;
    reasons.push("high profit + low effort");
  }
  if (profit < 40 && effort.effortClass === "HEAVY" && (dueDays == null || dueDays > 5)) {
    score -= 20;
    reasons.push("low profit + heavy + not urgent — defer");
  }

  const route = String(routing.route || "").toUpperCase();
  if (route === "IN_HOUSE" && dueDays != null && dueDays <= 3) {
    score += 15;
    reasons.push("in-house rush");
  }
  if (route === "BULLSEYE" && dueDays != null && dueDays <= 5) {
    score += 20;
    reasons.push("outsourced — schedule vendor lead time");
  }
  if (route === "DTF") {
    score += 5;
    reasons.push("DTF routing");
  }

  const fos = String(job && job.foundationStatus ? job.foundationStatus : "").toUpperCase();
  if (fos === "BLOCKED") {
    score -= 40;
    reasons.push("foundation BLOCKED");
  }

  score = Math.round(Math.max(0, Math.min(200, score)));

  return {
    jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
    priorityScore: score,
    reasons,
  };
}

module.exports = {
  scoreJobPriority,
  daysUntilDue,
};
