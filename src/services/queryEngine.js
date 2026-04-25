function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ts) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function detectIntent(question) {
  const q = String(question || "").toLowerCase().trim();
  if (!q) return { intent: "UNKNOWN", filter: "none" };
  if (q.includes("print first") || q.includes("first") || q.includes("next job") || q.includes("next up") || q.includes("what's next") || q.includes("whats next")) {
    return { intent: "NEXT_JOBS", filter: "next" };
  }
  if (q.includes("schedule") || q.includes("next week") || q.includes("7 day") || q.includes("seven day")) {
    return { intent: "SCHEDULE", filter: "schedule" };
  }
  if (q.includes("order") || q.includes("purchase") || q.includes("buy") || q.includes("need to order")) {
    return { intent: "PURCHASING", filter: "purchasing" };
  }
  if (q.includes("bullseye") || q.includes("bulk vendor")) {
    return { intent: "BULLSEYE_JOBS", filter: "bullseye" };
  }
  if (q.includes("outsource") || q.includes("send out")) {
    return { intent: "OUTSOURCE_JOBS", filter: "outsource" };
  }
  if (q.includes("profit") || q.includes("margin") || q.includes("revenue") || q.includes("money") || q.includes("finance") || q.includes("make")) {
    return { intent: "FINANCE", filter: "finance" };
  }
  if (q.includes("plan my day") || q.includes("day plan") || q.includes("today's plan") || q.includes("todays plan")) {
    return { intent: "DAY_PLAN", filter: "day_plan" };
  }
  if (q.includes("today") && (q.includes("task") || q.includes("tasks"))) {
    return { intent: "TODAY_TASKS", filter: "today_tasks" };
  }
  if (q.includes("group") || q.includes("batch")) {
    return { intent: "BATCHES", filter: "batches" };
  }
  if (q.includes("task")) {
    return { intent: "TASKS", filter: "tasks" };
  }
  if (q.includes("due today") || q.includes("today")) return { intent: "JOBS_DUE_TODAY", filter: "due_today" };
  if (q.includes("need") && q.includes("print")) return { intent: "NEEDS_PRINTING", filter: "needs_printing" };
  if (q.includes("overdue") || q.includes("late")) return { intent: "OVERDUE", filter: "overdue" };
  if (q.includes("blocked")) return { intent: "BLOCKED", filter: "blocked" };
  if (q.includes("ready")) return { intent: "READY", filter: "ready" };
  if (q.includes("paid")) return { intent: "PAID", filter: "paid" };
  if (q.includes("unpaid")) return { intent: "UNPAID", filter: "unpaid" };
  if (q.includes("all") || q.includes("everything")) return { intent: "ALL", filter: "all" };
  return { intent: "UNKNOWN", filter: "none" };
}

function interpretQuery(question, jobs) {
  if (arguments.length < 2 || typeof jobs === "undefined") {
    return detectIntent(question);
  }
  const { intent, filter } = detectIntent(question);
  const filtered = filterJobs(jobs, filter);
  const answer = buildAnswer(intent, filtered);
  return { intent, answer, jobs: filtered };
}

function filterJobs(jobs, filter) {
  const list = Array.isArray(jobs) ? jobs : [];
  const now = Date.now();
  if (filter === "due_today") {
    const s = startOfDay(now);
    const e = endOfDay(now);
    return list.filter((j) => {
      const t = new Date(j.dueDate).getTime();
      return Number.isFinite(t) && t >= s && t <= e;
    });
  }
  if (filter === "overdue") {
    return list.filter((j) => {
      const t = new Date(j.dueDate).getTime();
      return (j.status === "OVERDUE") || (Number.isFinite(t) && t < startOfDay(now) && j.status !== "PAID");
    });
  }
  if (filter === "needs_printing") {
    return list.filter((j) => j.status !== "PAID" && j.productionType !== "UNKNOWN");
  }
  if (filter === "next") {
    return list
      .filter((j) => String(j.status || "").toUpperCase() !== "PAID" && j.hasArt === true)
      .sort((a, b) => Number(b.priorityScore || 0) - Number(a.priorityScore || 0))
      .slice(0, 5);
  }
  if (filter === "blocked") {
    return list.filter((j) => String(j.status || "").toUpperCase() !== "PAID" && !j.hasArt);
  }
  if (filter === "ready") {
    return list.filter((j) => j.status === "UNPAID" || j.status === "READY");
  }
  if (filter === "paid") return list.filter((j) => j.status === "PAID");
  if (filter === "unpaid") return list.filter((j) => j.status !== "PAID");
  if (filter === "all") return list;
  return [];
}

function buildAnswer(intent, jobs) {
  const count = Array.isArray(jobs) ? jobs.length : 0;
  switch (intent) {
    case "NEXT_JOBS":
      if (count === 0) return "No jobs are ready to print (all blocked on art or info).";
      return `Print next: ${count} ${count === 1 ? "job" : "jobs"} ready, top priority first.`;
    case "BLOCKED":
      return `${count} ${count === 1 ? "job is" : "jobs are"} blocked.`;
    case "BATCHES":
      return `${count} ${count === 1 ? "job groups into 1 batch" : "jobs available to batch"} — see production.batches for grouping.`;
    case "TASKS":
    case "TODAY_TASKS":
      return `${count} ready ${count === 1 ? "job" : "jobs"} — see production.tasks for the step-by-step flow per job.`;
    case "DAY_PLAN":
      return "See plan[] for today's priority-ordered playbook.";
    case "SCHEDULE":
      return "See schedule.days[] for the next 7 days of production load.";
    case "PURCHASING":
      return "See purchasing.list[] for the consolidated blanks order.";
    case "BULLSEYE_JOBS":
      return "Jobs recommended for BULLSEYE are marked in routing/vendors.";
    case "OUTSOURCE_JOBS":
      return "Jobs recommended for OUTSOURCE are marked in routing/vendors.";
    case "FINANCE":
      return "See financials for revenue, cost, profit, and margin across jobs.";
    case "JOBS_DUE_TODAY":
      return `${count} ${count === 1 ? "job" : "jobs"} due today`;
    case "NEEDS_PRINTING":
      return `${count} ${count === 1 ? "job needs" : "jobs need"} printing`;
    case "OVERDUE":
      return `${count} overdue ${count === 1 ? "job" : "jobs"}`;
    case "READY":
      return `${count} ${count === 1 ? "job is" : "jobs are"} ready`;
    case "PAID":
      return `${count} paid ${count === 1 ? "job" : "jobs"}`;
    case "UNPAID":
      return `${count} unpaid ${count === 1 ? "job" : "jobs"}`;
    case "ALL":
      return `${count} total ${count === 1 ? "job" : "jobs"}`;
    default:
      return "Unknown query. Try: 'jobs due today', 'what needs printing', 'what is overdue', 'what is ready'.";
  }
}

module.exports = {
  interpretQuery,
  detectIntent,
  filterJobs,
  buildAnswer,
};
