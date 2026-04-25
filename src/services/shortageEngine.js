/**
 * Jobs blocked by garment shortage (no full allocation).
 */

function evaluateGarmentBlockers(jobs, shortages) {
  const shortList = Array.isArray(shortages) ? shortages : [];
  const byJob = new Map();
  for (const s of shortList) {
    const jid = s.jobId;
    if (!jid) continue;
    if (!byJob.has(jid)) byJob.set(jid, []);
    byJob.get(jid).push({
      sku: s.sku,
      product: s.product,
      color: s.color,
      size: s.size,
      qtyShort: s.qtyShort,
    });
  }

  const jobMap = new Map((Array.isArray(jobs) ? jobs : []).map((j) => [j.jobId, j]));
  const out = [];

  for (const [jobId, missing] of byJob.entries()) {
    out.push({
      jobId,
      customer: (jobMap.get(jobId) && (jobMap.get(jobId).customer || jobMap.get(jobId).customerName)) || "Unknown",
      reason: "GARMENT_SHORTAGE",
      missing,
    });
  }

  return out;
}

module.exports = {
  evaluateGarmentBlockers,
};
