const { calculatePriority, hasArtFlag } = require("./priorityEngine");
const { groupJobsIntoBatches } = require("./batchEngine");
const { generateAllTasks } = require("./taskEngine");
const { routeJob } = require("./routingEngine");
const { chooseVendor } = require("./vendorEngine");
const { calculatePrice } = require("./pricingEngine");

function priorityWeight(status) {
  const s = String(status || "").toUpperCase();
  if (s === "OVERDUE") return 100;
  if (s === "UNPAID") return 60;
  if (s === "READY") return 40;
  if (s === "PAID") return 10;
  return 20;
}

function detectBlockedReason(job) {
  const reasons = detectBlockedReasons(job);
  return reasons.length > 0 ? reasons[0] : null;
}

function detectBlockedReasons(job) {
  const reasons = [];
  if (!job) {
    reasons.push("UNKNOWN JOB");
    return reasons;
  }
  const fos = String(job.foundationStatus || "").toUpperCase();
  if (fos === "BLOCKED") reasons.push("OS BLOCKED");
  if (job.depositPaid === false) reasons.push("DEPOSIT REQUIRED");
  if (!hasArtFlag(job)) reasons.push("ART MISSING");
  const pm = String(job.printMethod || job.productionType || "").toUpperCase();
  if (!pm || pm === "UNKNOWN") reasons.push("UNKNOWN PRINT METHOD");
  if (!job.customer || job.customer === "Unknown Customer") reasons.push("MISSING INFO");

  const items = Array.isArray(job.lineItems) ? job.lineItems : [];
  const totalQty = items.reduce((sum, it) => sum + Number((it && it.qty) || 0), 0);
  if (totalQty <= 0 && !(Number(job.amount || 0) > 0)) reasons.push("MISSING QUANTITY");

  const hasGarmentField = items.some((it) => it && it.garment);
  if (!hasGarmentField && !job.garment) reasons.push("MISSING GARMENT");

  return reasons;
}

function queueEntry(job, idx) {
  const score = Number.isFinite(Number(job && job.priorityScore)) ? Number(job.priorityScore) : calculatePriority(job);
  return {
    position: idx + 1,
    jobId: job && job.jobId ? job.jobId : `JOB-UNKNOWN-${idx + 1}`,
    customer: job && job.customer ? job.customer : "Unknown Customer",
    status: job && job.status ? job.status : "UNPAID",
    productionType: job && job.productionType ? job.productionType : "UNKNOWN",
    printMethod: job && job.printMethod ? job.printMethod : "UNKNOWN",
    hasArt: Boolean(hasArtFlag(job)),
    dueDate: job && job.dueDate ? job.dueDate : null,
    priority: score,
    legacyPriority: priorityWeight(job && job.status),
  };
}

function buildProductionQueue(jobs) {
  try {
    const list = Array.isArray(jobs) ? jobs.slice() : [];

    const blocked = [];
    const readyJobs = [];
    for (const job of list) {
      const status = String(job && job.status ? job.status : "").toUpperCase();
      if (status === "PAID") continue;
      const fss = String(job && job.foundationStatus ? job.foundationStatus : "").toUpperCase();
      if (fss === "COMPLETE") continue;
      const reasons = detectBlockedReasons(job);
      if (reasons.length > 0 && reasons[0] !== null) {
        blocked.push({
          jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
          customer: job && job.customer ? job.customer : "Unknown Customer",
          status,
          dueDate: job && job.dueDate ? job.dueDate : null,
          printMethod: job && job.printMethod ? job.printMethod : "UNKNOWN",
          reason: reasons[0],
          reasons,
        });
      } else {
        readyJobs.push(job);
      }
    }

    readyJobs.sort((a, b) => {
      const pa = Number.isFinite(Number(a && a.priorityScore)) ? Number(a.priorityScore) : calculatePriority(a);
      const pb = Number.isFinite(Number(b && b.priorityScore)) ? Number(b.priorityScore) : calculatePriority(b);
      if (pb !== pa) return pb - pa;
      const ta = new Date(a && a.dueDate).getTime();
      const tb = new Date(b && b.dueDate).getTime();
      const tva = Number.isFinite(ta) ? ta : Infinity;
      const tvb = Number.isFinite(tb) ? tb : Infinity;
      return tva - tvb;
    });

    const ready = readyJobs.map((job, idx) => queueEntry(job, idx));

    return {
      ready,
      blocked,
      queue: ready,
    };
  } catch (error) {
    console.error("[productionEngine] buildProductionQueue failed:", error && error.message ? error.message : error);
    return { ready: [], blocked: [], queue: [] };
  }
}

function buildFullProductionReport(jobs) {
  try {
    const base = buildProductionQueue(jobs);
    const readyJobSources = Array.isArray(jobs)
      ? jobs.filter((j) => base.ready.some((r) => r.jobId === j.jobId))
      : [];

    const routing = readyJobSources.map((j) => routeJob(j));
    const vendors = readyJobSources.map((j) => chooseVendor(j));
    const pricing = readyJobSources.map((j) => calculatePrice(j));

    const routingById = new Map(routing.map((r) => [r.jobId, r]));
    const vendorById = new Map(vendors.map((v) => [v.jobId, v]));
    const priceById = new Map(pricing.map((p) => [p.jobId, p]));

    const enrichedReady = base.ready.map((r) => {
      const route = routingById.get(r.jobId);
      const vendor = vendorById.get(r.jobId);
      const price = priceById.get(r.jobId);
      return {
        ...r,
        routing: route ? { method: route.method, location: route.location, reasons: route.reasons, qty: route.qty, colors: route.colors } : null,
        vendor: vendor ? { vendor: vendor.vendor, reason: vendor.reason, reasons: vendor.reasons, daysUntilDue: vendor.daysUntilDue } : null,
        cost: price ? price.cost : 0,
        price: price ? price.price : 0,
        profit: price ? price.profit : 0,
        marginPercent: price ? price.marginPercent : 0,
      };
    });

    const batches = groupJobsIntoBatches(readyJobSources);
    const tasks = generateAllTasks(readyJobSources);

    return {
      queue: enrichedReady,
      ready: enrichedReady,
      blocked: base.blocked,
      batches,
      tasks,
      routing,
      vendors,
      pricing,
    };
  } catch (error) {
    console.error("[productionEngine] buildFullProductionReport failed:", error && error.message ? error.message : error);
    return { queue: [], ready: [], blocked: [], batches: [], tasks: [], routing: [], vendors: [], pricing: [] };
  }
}

module.exports = {
  buildProductionQueue,
  buildFullProductionReport,
  detectBlockedReason,
  detectBlockedReasons,
};
