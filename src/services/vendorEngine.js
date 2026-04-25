const { routeJob } = require("./routingEngine");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntilDue(job) {
  const t = new Date(job && job.dueDate).getTime();
  if (!Number.isFinite(t)) return null;
  const now = Date.now();
  return Math.ceil((t - now) / MS_PER_DAY);
}

function totalQty(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  const q = items.reduce((sum, it) => sum + Number((it && it.qty) || 0), 0);
  return q > 0 ? q : Number((job && job.qty) || 0) || 0;
}

function chooseVendor(job) {
  try {
    const qty = totalQty(job);
    const days = daysUntilDue(job);
    const routing = routeJob(job);
    const method = routing.method;

    let vendor = "IN_HOUSE";
    const reasons = [];

    if (days !== null && days <= 3 && qty < 144) {
      vendor = "IN_HOUSE";
      reasons.push(`rush job (due in ${days} day${days === 1 ? "" : "s"}) → IN_HOUSE`);
    } else if (method === "EMBROIDERY") {
      vendor = "OUTSOURCE";
      reasons.push("embroidery → OUTSOURCE");
    } else if (method === "DTF" && qty >= 100) {
      vendor = "OUTSOURCE";
      reasons.push(`DTF bulk (qty ${qty}) → OUTSOURCE transfers`);
    } else if (qty >= 144) {
      vendor = "BULLSEYE";
      reasons.push(`bulk qty ${qty} ≥ 144 → BULLSEYE`);
    } else {
      vendor = "IN_HOUSE";
      reasons.push("standard in-house run");
    }

    return {
      jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
      vendor,
      method,
      qty,
      daysUntilDue: days,
      reason: reasons[0] || "default",
      reasons,
    };
  } catch (error) {
    console.error("[vendorEngine] chooseVendor failed:", error && error.message ? error.message : error);
    return { jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN", vendor: "IN_HOUSE", method: "UNKNOWN", qty: 0, daysUntilDue: null, reason: "vendor_error", reasons: ["vendor_error"] };
  }
}

module.exports = {
  chooseVendor,
};
