/**
 * 7-day production plan: capacity, effort, routing, readiness, profit priority.
 */
const { getDailyCapacity } = require("./capacityEngine");
const { estimateJobEffort } = require("./effortEngine");
const { evaluateJobReadiness } = require("./readinessEngine");
const { scoreJobPriority } = require("./profitPriorityEngine");
const { calculatePrice } = require("./pricingEngine");
const { decideRoute, buildVendorRouteInputFromJob } = require("./vendorRoutingService");
const { routeJob } = require("./routingEngine");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { logEvent } = require("./foundationEventLog");

const OUTSOURCE_LEAD_DAYS = 3;

function ymd(d) {
  const x = new Date(d);
  x.setHours(12, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function nextSevenDaysFromToday() {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    out.push(ymd(d));
  }
  return out;
}

function capacityChannelForJob(job, effort, routeDecision) {
  const r = routeJob(job);
  const method = String(r.method || "UNKNOWN").toUpperCase();
  if (String(routeDecision.route).toUpperCase() === "BULLSEYE") return "OUTSOURCE";
  if (method === "DTG") return "DTG";
  if (method === "DTF" || String(routeDecision.route).toUpperCase() === "DTF") return "DTF";
  if (method === "SCREEN") return "SCREEN";
  if (method === "EMBROIDERY") return "EMBROIDERY";
  return "DTG";
}

function minutesBudgetForChannel(cap, channel) {
  const c = channel.toUpperCase();
  if (c === "DTG") return cap.dtgHoursPerDay * 60;
  if (c === "DTF") return cap.dtfHoursPerDay * 60;
  if (c === "SCREEN") return cap.screenHoursPerDay * 60;
  if (c === "EMBROIDERY") return cap.embroideryHoursPerDay * 60;
  return cap.dtgHoursPerDay * 60;
}

async function logPlanner(message) {
  try {
    await logEvent(null, "WEEK_PLANNER", message);
  } catch (_e) {
    console.log("[weekPlanner]", message);
  }
}

function enrichJob(job) {
  const finance = calculatePrice(job);
  const effort = estimateJobEffort(job);
  const readiness = evaluateJobReadiness(job);
  const routeInput = buildVendorRouteInputFromJob(job);
  const routing = decideRoute(routeInput, { forceBullseye: false });
  const priority = scoreJobPriority(job, { finance, effort, routing, readiness });
  const channel = capacityChannelForJob(job, effort, routing);

  return {
    job,
    finance,
    effort,
    readiness,
    routing,
    priority,
    channel,
    routeInput,
  };
}

/**
 * @param {object[]} [jobsInput] - optional; loads merged jobs if omitted
 */
async function buildWeeklyPlan(jobsInput) {
  const assumptions = [
    "Plan uses merged store+foundation jobs when DB is available.",
    "Profit uses pricingEngine (invoice when present, else modeled).",
    "Capacity is approximate; adjust via CAPACITY_* env vars.",
  ];

  let jobs = jobsInput;
  let mock = false;
  let degraded = false;
  let loadError = false;
  try {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      jobs = await getOperatingSystemJobs();
    }
  } catch (e) {
    degraded = true;
    loadError = true;
    mock = true;
    jobs = [];
    assumptions.push(`Job load degraded: ${e && e.message ? e.message : "error"}`);
  }

  if (!Array.isArray(jobs)) jobs = [];

  const cap = getDailyCapacity();
  const dayKeys = nextSevenDaysFromToday();
  const dayState = {};
  for (const dk of dayKeys) {
    dayState[dk] = {
      date: dk,
      assignedJobs: [],
      batches: [],
      totalMinutes: 0,
      byChannel: { DTG: 0, DTF: 0, SCREEN: 0, EMBROIDERY: 0 },
      jobCount: 0,
    };
  }

  const blocked = [];
  const outsourced = [];
  const overflow = [];
  const enriched = [];

  for (const job of jobs) {
    const row = enrichJob(job);
    enriched.push(row);
    if (!row.readiness.ready) {
      blocked.push({
        jobId: job.jobId,
        customer: job.customer || job.customerName || "Unknown",
        dueDate: job.dueDate || null,
        reasons: row.readiness.blockedReasons,
        priorityScore: row.priority.priorityScore,
        routing: row.routing,
      });
    }
  }

  const readyRows = enriched.filter((r) => r.readiness.ready);
  readyRows.sort((a, b) => b.priority.priorityScore - a.priority.priorityScore);

  for (const row of readyRows) {
    const { job, effort, routing, priority } = row;
    const channel = row.channel;

    if (channel === "OUTSOURCE" || String(routing.route).toUpperCase() === "BULLSEYE") {
      const due = job.dueDate ? new Date(job.dueDate) : null;
      let orderBy = null;
      if (due && Number.isFinite(due.getTime())) {
        const ob = new Date(due);
        ob.setDate(ob.getDate() - OUTSOURCE_LEAD_DAYS);
        orderBy = ymd(ob);
      }
      outsourced.push({
        jobId: job.jobId,
        customer: job.customer || job.customerName || "Unknown",
        dueDate: job.dueDate || null,
        recommendedOrderBy: orderBy,
        routing,
        priorityScore: priority.priorityScore,
        reason: "Vendor screen / Bullseye path — schedule with lead time",
        urgency: routing.reason,
      });
      await logPlanner(`outsourced recommendation ${job.jobId} → ${routing.route}`);
      continue;
    }

    const totalMin = Math.min(24 * 60, Number(effort.totalMinutes) || 60);
    let placed = false;

    for (const dk of dayKeys) {
      const st = dayState[dk];
      if (st.jobCount >= cap.maxJobsPerDay) continue;
      const budget = minutesBudgetForChannel(cap, channel);
      const used = st.byChannel[channel] || 0;
      if (used + totalMin > budget + 1) continue;
      st.assignedJobs.push({
        jobId: job.jobId,
        customer: job.customer || job.customerName || "Unknown",
        dueDate: job.dueDate || null,
        channel,
        totalMinutes: totalMin,
        effortClass: effort.effortClass,
        priorityScore: priority.priorityScore,
        routing: routing.route,
        reasons: priority.reasons.slice(0, 4),
      });
      st.byChannel[channel] = used + totalMin;
      st.totalMinutes += totalMin;
      st.jobCount += 1;
      placed = true;
      break;
    }

    if (!placed) {
      overflow.push({
        jobId: job.jobId,
        customer: job.customer || job.customerName || "Unknown",
        channel,
        totalMinutes: totalMin,
        priorityScore: priority.priorityScore,
        reason: "No capacity slot in 7-day window",
      });
      await logPlanner(`deferred/overflow ${job.jobId} (${channel})`);
    }
  }

  const week = dayKeys.map((dk) => {
    const st = dayState[dk];
    const channelsUsed = Object.entries(st.byChannel).filter(([, v]) => v > 0);
    const totalBudget =
      cap.dtgHoursPerDay * 60 + cap.dtfHoursPerDay * 60 + cap.screenHoursPerDay * 60 + cap.embroideryHoursPerDay * 60;
    const util = st.totalMinutes / Math.max(1, totalBudget / 4);
    let capacityStatus = "OPEN";
    if (util >= 0.95 || st.jobCount >= cap.maxJobsPerDay) capacityStatus = "FULL";
    if (util > 1.05) capacityStatus = "OVERLOADED";

    const methodKey = channelsUsed.length ? channelsUsed.sort((a, b) => b[1] - a[1])[0][0] : "MIXED";
    st.batches = [{ label: `${methodKey} batch`, jobIds: st.assignedJobs.map((j) => j.jobId) }];

    return {
      date: dk,
      assignedJobs: st.assignedJobs,
      batches: st.batches,
      totalMinutes: st.totalMinutes,
      capacityStatus,
      byChannel: st.byChannel,
    };
  });

  await logPlanner(`weekly plan built: ${week.reduce((s, d) => s + d.assignedJobs.length, 0)} assignments, blocked ${blocked.length}, outsource ${outsourced.length}, overflow ${overflow.length}`);

  return {
    week,
    blocked,
    outsourced,
    overflow,
    assumptions,
    mock: Boolean(mock || degraded || loadError),
    degraded,
    loadError,
    capacity: cap,
  };
}

function normalizeScheduleQuery(text) {
  const q = String(text || "").toLowerCase().trim();
  if (/what\s+do\s+we\s+run\s+today|what\s+to\s+run\s+today|run\s+today|today.*\b(print|production|run)\b/i.test(q)) return "today";
  if (/blocked|what\s+is\s+blocked|blocked\s+jobs/i.test(q)) return "blocked";
  if (/outsourc|vendor\s+now|bullseye\s+now|what\s+should\s+be\s+outsourced/i.test(q)) return "outsourced";
  if (/what\s+should\s+wait|defer|low\s+priority|should\s+wait/i.test(q)) return "wait";
  if (/high\s+profit|profit.*first|margin.*jobs|go\s+first/i.test(q)) return "profit";
  if (/plan\s+this\s+week|week\s+plan|schedule\s+this\s+week|plan\s+the\s+week|production\s+plan/i.test(q)) return "week";
  return "week";
}

async function buildScheduleAnswer(view, plan) {
  const p = plan || (await buildWeeklyPlan());
  const today = ymd(new Date());

  if (view === "today") {
    const day = (p.week || []).find((d) => d.date === today) || { assignedJobs: [], capacityStatus: "OPEN" };
    return {
      summary: `Today (${today}): ${day.assignedJobs.length} job(s) scheduled — ${day.capacityStatus}.`,
      data: { todayPlan: day, weeklyPlan: p.week, capacitySummary: p.capacity },
      mock: p.mock,
    };
  }
  if (view === "blocked") {
    return {
      summary: `${(p.blocked || []).length} job(s) blocked this week.`,
      data: { blockedJobs: p.blocked, assumptions: p.assumptions },
      mock: p.mock,
    };
  }
  if (view === "outsourced") {
    return {
      summary: `${(p.outsourced || []).length} job(s) recommended for vendor / outsource now.`,
      data: { outsourcedJobs: p.outsourced, weeklyPlan: p.week },
      mock: p.mock,
    };
  }
  if (view === "wait") {
    const low = (p.overflow || []).concat(
      (p.week || [])
        .flatMap((d) => d.assignedJobs || [])
        .filter((j) => (j.priorityScore || 0) < 45),
    );
    return {
      summary: `${low.length} job(s) deferred or low priority — review overflow list.`,
      data: { overflowJobs: p.overflow, deferred: low.slice(0, 20), weeklyPlan: p.week },
      mock: p.mock,
    };
  }
  if (view === "profit") {
    const all = [];
    for (const d of p.week || []) {
      for (const j of d.assignedJobs || []) all.push(j);
    }
    all.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
    return {
      summary: "Highest priority / profit-weighted jobs (see list).",
      data: {
        highProfitFirst: all.slice(0, 15),
        weeklyPlan: p.week,
        capacitySummary: p.capacity,
      },
      mock: p.mock,
    };
  }

  return {
    summary: `7-day plan: ${(p.week || []).reduce((s, d) => s + (d.assignedJobs || []).length, 0)} assignments.`,
    data: {
      weeklyPlan: p.week,
      blockedJobs: p.blocked,
      outsourcedJobs: p.outsourced,
      overflowJobs: p.overflow,
      capacitySummary: p.capacity,
      assumptions: p.assumptions,
    },
    mock: p.mock,
  };
}

async function handleScheduleCommand(parsed) {
  const text = parsed.text || "";
  const view = normalizeScheduleQuery(text);
  const plan = await buildWeeklyPlan();
  const ans = await buildScheduleAnswer(view, plan);
  return { view, ...ans };
}

module.exports = {
  buildWeeklyPlan,
  buildScheduleAnswer,
  handleScheduleCommand,
  normalizeScheduleQuery,
  nextSevenDaysFromToday,
};
