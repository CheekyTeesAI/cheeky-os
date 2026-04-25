const DAILY_CAPACITY = Number(process.env.SHOP_DAILY_CAPACITY || 6);

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function jobDayOffset(job) {
  const t = new Date(job && job.dueDate).getTime();
  if (!Number.isFinite(t)) return 0;
  const start = startOfDay(Date.now()).getTime();
  const diff = Math.floor((startOfDay(t).getTime() - start) / (24 * 60 * 60 * 1000));
  if (diff < 0) return 0;
  if (diff > 6) return 6;
  return diff;
}

function sanitizeJob(job) {
  return {
    jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
    customer: job && job.customer ? job.customer : "Unknown Customer",
    status: job && job.status ? job.status : "UNPAID",
    productionType: job && job.productionType ? job.productionType : "UNKNOWN",
    printMethod: job && job.printMethod ? job.printMethod : "UNKNOWN",
    dueDate: job && job.dueDate ? job.dueDate : null,
    hasArt: Boolean(job && job.hasArt),
    priorityScore: Number.isFinite(Number(job && job.priorityScore)) ? Number(job.priorityScore) : 0,
  };
}

function planNext7Days(jobs) {
  try {
    const list = Array.isArray(jobs) ? jobs.slice() : [];
    const days = [];
    const base = startOfDay(Date.now());
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
      days.push({
        date: formatDateKey(d),
        offset: i,
        label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" }),
        jobs: [],
      });
    }

    const unscheduled = list
      .filter((j) => String((j && j.status) || "").toUpperCase() !== "PAID")
      .map(sanitizeJob)
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

    for (const job of unscheduled) {
      let offset = jobDayOffset(job);
      let placed = false;
      for (let step = 0; step < 7; step += 1) {
        const candidate = (offset + step) % 7;
        if (days[candidate].jobs.length < DAILY_CAPACITY) {
          days[candidate].jobs.push(job);
          placed = true;
          break;
        }
      }
      if (!placed) {
        days[6].jobs.push(job);
      }
    }

    console.log("[scheduler] SCHEDULE BUILT:", unscheduled.length, "jobs across 7 days (capacity/day =", DAILY_CAPACITY, ")");
    return { days, dailyCapacity: DAILY_CAPACITY };
  } catch (error) {
    console.error("[scheduler] planNext7Days failed:", error && error.message ? error.message : error);
    return { days: [], dailyCapacity: DAILY_CAPACITY };
  }
}

module.exports = {
  planNext7Days,
};
