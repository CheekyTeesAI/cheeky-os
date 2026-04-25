/**
 * Rough production effort estimates (minutes). Safe defaults; not a quote engine.
 */
const { routeJob } = require("./routingEngine");
const { hasArtFlag } = require("./priorityEngine");

function totalQty(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  const q = items.reduce((sum, it) => sum + Number((it && it.qty) || 0), 0);
  return q > 0 ? q : Number((job && job.qty) || 0) || 0;
}

function locBonus(job) {
  const n = String((job && job.notes) || "").toLowerCase();
  let spots = 0;
  if (n.includes("front")) spots++;
  if (n.includes("back") || n.includes("rear")) spots++;
  if (n.includes("left chest") || n.includes("right chest")) spots++;
  if (n.includes("sleeve")) spots++;
  return Math.min(4, spots) * 8;
}

function estimateJobEffort(job) {
  try {
    const jobId = job && job.jobId ? job.jobId : "JOB-UNKNOWN";
    const qty = Math.max(1, totalQty(job));
    const routed = routeJob(job);
    const method = String(routed.method || "UNKNOWN").toUpperCase();
    const notes = String((job && job.notes) || "").toLowerCase();

    let setupMinutes = 25;
    let productionMinutes = 20;
    let qcMinutes = 8;

    if (method === "DTG") {
      setupMinutes = 15;
      productionMinutes = Math.min(45, 18 + Math.floor(qty * 0.35));
      qcMinutes = 7;
    } else if (method === "DTF") {
      setupMinutes = 12;
      productionMinutes = Math.min(40, 15 + Math.floor(qty * 0.3));
      qcMinutes = 6;
    } else if (method === "SCREEN") {
      setupMinutes = 55;
      productionMinutes = Math.min(90, 35 + Math.floor(qty * 0.45));
      qcMinutes = 12;
    } else if (method === "EMBROIDERY") {
      setupMinutes = 40;
      productionMinutes = Math.min(120, 30 + Math.floor(qty * 1.2));
      qcMinutes = 10;
    } else {
      setupMinutes = 25;
      productionMinutes = 30 + Math.floor(qty * 0.25);
      qcMinutes = 8;
    }

    productionMinutes += locBonus(job);

    if (!hasArtFlag(job) || notes.includes("art review") || notes.includes("proof")) {
      productionMinutes += 20;
    }

    const totalMinutes = setupMinutes + productionMinutes + qcMinutes;
    let effortClass = "LIGHT";
    if (totalMinutes >= 140) effortClass = "HEAVY";
    else if (totalMinutes >= 75) effortClass = "MEDIUM";

    return {
      jobId,
      setupMinutes,
      productionMinutes,
      qcMinutes,
      totalMinutes,
      effortClass,
      methodUsed: method,
      assumptions: [
        "Effort is modeled from qty, print method, and notes — not measured runtime.",
      ],
    };
  } catch (e) {
    return {
      jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
      setupMinutes: 20,
      productionMinutes: 30,
      qcMinutes: 8,
      totalMinutes: 58,
      effortClass: "MEDIUM",
      methodUsed: "UNKNOWN",
      assumptions: ["effort_fallback", e && e.message ? e.message : "error"],
    };
  }
}

module.exports = {
  estimateJobEffort,
  totalQty,
};
