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

function isDueTodayIso(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= startOfToday() && t <= endOfToday();
}

function humanMethodLabel(method) {
  const m = String(method || "").toUpperCase();
  if (m === "SCREEN") return "screen print";
  if (m === "HEAT_PRESS") return "heat press";
  return m.toLowerCase();
}

function buildTodayPlan(queue, batches) {
  try {
    const q = Array.isArray(queue) ? queue : [];
    const b = Array.isArray(batches) ? batches : [];

    const plan = [];

    const dueTodayInQueue = q.filter((j) => isDueTodayIso(j && j.dueDate));
    if (dueTodayInQueue.length > 0) {
      const names = dueTodayInQueue.slice(0, 3).map((j) => j.customer).join(", ");
      plan.push(`Start with ${dueTodayInQueue.length} job${dueTodayInQueue.length === 1 ? "" : "s"} due today: ${names}${dueTodayInQueue.length > 3 ? "…" : ""}.`);
    }

    const ordered = b.slice().sort((a, b2) => {
      const pa = a && a.jobs && a.jobs[0] ? Number(a.jobs[0].priorityScore || 0) : 0;
      const pb = b2 && b2.jobs && b2.jobs[0] ? Number(b2.jobs[0].priorityScore || 0) : 0;
      return pb - pa;
    });

    for (const batch of ordered.slice(0, 3)) {
      const label = humanMethodLabel(batch.printMethod);
      plan.push(`Run ${label} batch ${batch.batchId} (${batch.size} job${batch.size === 1 ? "" : "s"}, ${batch.garment.toLowerCase()}${batch.color !== "UNSPECIFIED" ? `/${batch.color.toLowerCase()}` : ""}).`);
    }

    if (ordered.length > 3) {
      plan.push(`Then work through the remaining ${ordered.length - 3} batch${ordered.length - 3 === 1 ? "" : "es"} in priority order.`);
    }

    if (plan.length === 0) {
      plan.push("No ready jobs today — focus on unblocking art and collecting open invoices.");
    } else {
      plan.push("Close the day with QC and handle any blocked jobs (art / info) last.");
    }

    return { plan };
  } catch (error) {
    console.error("[dayPlanner] buildTodayPlan failed:", error && error.message ? error.message : error);
    return { plan: ["Day plan unavailable — review queue manually."] };
  }
}

module.exports = {
  buildTodayPlan,
};
