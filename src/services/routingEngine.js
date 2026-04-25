function totalQty(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  const q = items.reduce((sum, it) => sum + Number((it && it.qty) || 0), 0);
  return q > 0 ? q : Number((job && job.qty) || 0) || 0;
}

function colorCount(job) {
  const notes = String((job && job.notes) || "").toLowerCase();
  const m = notes.match(/(\d+)\s*color/);
  if (m) return Math.max(1, Math.min(6, parseInt(m[1], 10) || 1));
  if (notes.includes("full color") || notes.includes("full-color") || notes.includes("photo")) return 5;
  if (notes.includes("2 color") || notes.includes("two color")) return 2;
  if (notes.includes("3 color")) return 3;
  return 1;
}

function mentionsEmbroidery(job) {
  const notes = String((job && job.notes) || "").toLowerCase();
  const pm = String((job && (job.printMethod || job.productionType)) || "").toUpperCase();
  return pm === "EMBROIDERY" || notes.includes("embroider") || notes.includes("stitch");
}

function routeJob(job) {
  try {
    const qty = totalQty(job);
    const colors = colorCount(job);
    const currentMethod = String((job && (job.printMethod || job.productionType)) || "").toUpperCase();

    let method = currentMethod || "UNKNOWN";
    const reasons = [];

    if (mentionsEmbroidery(job)) {
      method = "EMBROIDERY";
      reasons.push("embroidery keyword detected");
    } else if (qty > 0 && qty < 24) {
      if (colors >= 4) {
        method = "DTG";
        reasons.push(`qty ${qty} < 24 and full-color → DTG`);
      } else {
        method = "DTF";
        reasons.push(`qty ${qty} < 24 → DTF`);
      }
    } else if (qty >= 24) {
      if (colors <= 2) {
        method = "SCREEN";
        reasons.push(`qty ${qty} ≥ 24 with ${colors} color(s) → SCREEN`);
      } else {
        method = "DTG";
        reasons.push(`qty ${qty} ≥ 24 but ${colors} colors → DTG (screen setup uneconomical)`);
      }
    } else {
      method = currentMethod || "UNKNOWN";
      reasons.push("quantity unknown — defaulting to existing method");
    }

    let location = "IN_HOUSE";
    if (qty >= 144) {
      location = "BULLSEYE";
      reasons.push(`qty ${qty} ≥ 144 → BULLSEYE bulk production`);
    } else if (method === "EMBROIDERY" && qty >= 48) {
      location = "BULLSEYE";
      reasons.push("large embroidery run → BULLSEYE");
    }

    return {
      jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
      qty,
      colors,
      method,
      location,
      reasons,
    };
  } catch (error) {
    console.error("[routingEngine] routeJob failed:", error && error.message ? error.message : error);
    return { jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN", qty: 0, colors: 1, method: "UNKNOWN", location: "IN_HOUSE", reasons: ["routing_error"] };
  }
}

module.exports = {
  routeJob,
};
