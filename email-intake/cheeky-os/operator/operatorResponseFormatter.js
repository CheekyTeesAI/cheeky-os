"use strict";

/**
 * Friendly strings for operators (pure functions; advisory only).
 */

function moneyFromCents(cents) {
  const n = Number(cents) || 0;
  return `$${(n / 100).toFixed(2)}`;
}

function formatFinancialSummary(input) {
  const unpaid = Number(input && input.unpaidCount) || 0;
  const cents = Number(input && input.outstandingCents) || 0;
  const oldestDays = Number(input && input.oldestDays);
  const topCustomer = input && input.highestRiskCustomer;
  let s = `${moneyFromCents(cents)} currently outstanding across ${unpaid} invoice row(s) in the local snapshot.`;
  if (Number.isFinite(oldestDays) && oldestDays > 0) {
    s += ` Oldest bucket is about ${oldestDays} day(s) past due.`;
  }
  if (topCustomer && String(topCustomer).trim()) {
    s += ` Highest-attention customer in view: ${String(topCustomer).trim()}.`;
  }
  return s.trim();
}

function formatProductionSummary(input) {
  const q = Number(input && input.queueSize) || 0;
  const late = Number(input && input.lateJobsApprox) || 0;
  const art = Number(input && input.missingArt) || 0;
  const blanks = Number(input && input.missingBlanks) || 0;
  const run = Number(input && input.tasksRunning) || 0;
  const fail = Number(input && input.tasksFailed) || 0;
  let s = `Production queue ~${q} item(s); ${run} task(s) running; ${fail} failed in orchestration.`;
  if (late) s += ` ~${late} job(s) look late vs due hints.`;
  if (art || blanks) s += ` Gaps: ${art} missing art, ${blanks} missing blanks (heuristic).`;
  return s.trim();
}

function formatRecommendationSummary(rec) {
  if (!rec || typeof rec !== "object") return "No recommendation payload.";
  const title = String(rec.title || "Recommendation").trim();
  const sev = String(rec.severity || "info").trim();
  const cat = String(rec.category || "general").trim();
  const act = String(rec.suggestedAction || "").trim();
  let s = `${title} [${cat}/${sev}]`;
  if (rec.description) s += ` — ${String(rec.description).trim()}`;
  if (act) s += ` Suggested: ${act}`;
  return s.trim();
}

function formatOperationalAlert(alert) {
  if (alert == null) return "";
  if (typeof alert === "string") return alert.trim();
  const code = String(alert.code || "alert").trim();
  const sev = String(alert.severity || "info").trim();
  const desc = String(alert.description || "").trim();
  const c = alert.count != null ? ` (${alert.count})` : "";
  let s = `[${sev}] ${code}${c}`;
  if (desc) s += `: ${desc}`;
  return s.trim();
}

module.exports = {
  formatFinancialSummary,
  formatProductionSummary,
  formatRecommendationSummary,
  formatOperationalAlert,
};
