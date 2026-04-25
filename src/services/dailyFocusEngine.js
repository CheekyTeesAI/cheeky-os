/**
 * Human-readable daily focus buckets from ranked actions + risk/cash signals.
 */

function buildDailyFocus(actions, risks, cashflow, opportunities) {
  const act = Array.isArray(actions) ? actions : [];
  const rk = risks && typeof risks === "object" ? risks : {};
  const cf = cashflow && typeof cashflow === "object" ? cashflow : {};
  const op = opportunities && typeof opportunities === "object" ? opportunities : {};

  const notes = [];
  if ((cf.partialData || []).length) {
    notes.push(`Partial data: ${(cf.partialData || []).join(", ")} — verify in source systems.`);
  }

  const mustDo = [];
  for (const a of act) {
    if (a.type === "CASH" && (a.impact === "HIGH" || /Collect|Deposit/i.test(a.title))) {
      mustDo.push(a.title);
    }
  }
  for (const r of (rk.criticalRisks || []).slice(0, 4)) {
    mustDo.push(`Risk: past due ${r.jobId} (${r.customer})`);
  }
  const mustDoUnique = [...new Set(mustDo)].slice(0, 6);

  const shouldDo = act
    .filter((a) => !mustDoUnique.some((m) => a.title && m.includes(a.title.slice(0, 24))))
    .slice(0, 8)
    .map((a) => a.title);

  const avoid = [];
  if ((op.followUps || []).length > 10) {
    avoid.push("Chasing low-priority intakes before clearing cash and due-date risks.");
  }
  avoid.push("Starting new manual work before top blocked jobs are triaged.");
  if ((rk.blockedJobs || []).length > 15) {
    avoid.push("Spreading attention across all blocked jobs — batch by channel and due date.");
  }

  const todayTopPriorities = act.slice(0, 5).map((a) => ({
    title: a.title,
    type: a.type,
    priorityScore: a.priorityScore,
    nextCommand: a.nextCommand,
  }));

  return {
    todayTopPriorities,
    mustDo: mustDoUnique.slice(0, 5),
    shouldDo: shouldDo.slice(0, 7),
    avoid: avoid.slice(0, 5),
    notes,
  };
}

module.exports = {
  buildDailyFocus,
};
