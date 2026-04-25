function normalizeKey(value, fallback) {
  const v = String(value || "").trim().toUpperCase();
  return v || fallback;
}

function primaryGarment(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  if (items.length > 0 && items[0].garment) return normalizeKey(items[0].garment, "APPAREL");
  return "APPAREL";
}

function primaryColor(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  if (items.length > 0 && items[0].color) return normalizeKey(items[0].color, "UNSPECIFIED");
  if (job && job.color) return normalizeKey(job.color, "UNSPECIFIED");
  return "UNSPECIFIED";
}

function groupJobsIntoBatches(queue) {
  try {
    const list = Array.isArray(queue) ? queue : [];
    const buckets = new Map();

    for (const job of list) {
      const printMethod = normalizeKey(job && (job.printMethod || job.productionType), "UNKNOWN");
      const garment = primaryGarment(job);
      const color = primaryColor(job);
      const key = `${printMethod}|${garment}|${color}`;
      if (!buckets.has(key)) {
        buckets.set(key, {
          printMethod,
          garment,
          color,
          jobs: [],
        });
      }
      buckets.get(key).jobs.push({
        jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
        customer: job && job.customer ? job.customer : "Unknown Customer",
        status: job && job.status ? job.status : "UNPAID",
        dueDate: job && job.dueDate ? job.dueDate : null,
        priorityScore: Number.isFinite(Number(job && job.priorityScore)) ? Number(job.priorityScore) : 0,
      });
    }

    const counters = new Map();
    const batches = Array.from(buckets.values()).map((bucket) => {
      const count = (counters.get(bucket.printMethod) || 0) + 1;
      counters.set(bucket.printMethod, count);
      bucket.jobs.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      return {
        batchId: `${bucket.printMethod}-${count}`,
        printMethod: bucket.printMethod,
        garment: bucket.garment,
        color: bucket.color,
        size: bucket.jobs.length,
        jobs: bucket.jobs,
      };
    });

    batches.sort((a, b) => {
      const pa = a.jobs[0] ? a.jobs[0].priorityScore || 0 : 0;
      const pb = b.jobs[0] ? b.jobs[0].priorityScore || 0 : 0;
      if (pb !== pa) return pb - pa;
      return String(a.batchId).localeCompare(String(b.batchId));
    });

    console.log("[batchEngine] BATCHING COMPLETE:", batches.length, "batches from", list.length, "jobs");
    return batches;
  } catch (error) {
    console.error("[batchEngine] groupJobsIntoBatches failed:", error && error.message ? error.message : error);
    return [];
  }
}

module.exports = {
  groupJobsIntoBatches,
};
