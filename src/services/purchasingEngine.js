function defaultProductFor(garment) {
  const g = String(garment || "").toUpperCase();
  if (g.includes("HOODIE") || g.includes("SWEAT")) return "Independent SS4500 Hoodie";
  if (g.includes("POLO")) return "Port Authority K500 Polo";
  if (g.includes("HAT") || g.includes("CAP")) return "Richardson 112 Cap";
  if (g.includes("TANK")) return "Bella+Canvas 3480 Tank";
  if (g.includes("LONG")) return "Gildan 2400 Long Sleeve";
  if (g.includes("SHIRT") || g.includes("TEE") || g === "APPAREL") return "Gildan 64000 Tee";
  return garment ? String(garment) : "Gildan 64000 Tee";
}

function normalize(value, fallback) {
  const v = String(value || "").trim();
  return v || fallback;
}

function generatePurchaseList(jobs) {
  try {
    const list = Array.isArray(jobs) ? jobs : [];
    const buckets = new Map();

    for (const job of list) {
      const status = String((job && job.status) || "").toUpperCase();
      if (status === "PAID") continue;

      const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
      if (items.length === 0) {
        const qty = Number((job && job.qty) || 0);
        if (qty > 0) {
          const key = `${normalize(job.garment, "APPAREL").toUpperCase()}|${normalize(job.color, "UNSPECIFIED").toUpperCase()}`;
          if (!buckets.has(key)) {
            buckets.set(key, { garment: normalize(job.garment, "APPAREL"), color: normalize(job.color, "UNSPECIFIED"), sizes: {}, total: 0, jobs: [] });
          }
          const b = buckets.get(key);
          b.sizes.L = (b.sizes.L || 0) + qty;
          b.total += qty;
          if (!b.jobs.includes(job.jobId)) b.jobs.push(job.jobId);
        }
        continue;
      }

      for (const it of items) {
        const qty = Number((it && it.qty) || 0);
        if (qty <= 0) continue;
        const garment = normalize(it.garment, "APPAREL");
        const color = normalize(it.color, "UNSPECIFIED");
        const size = normalize(it.size, "L").toUpperCase();
        const key = `${garment.toUpperCase()}|${color.toUpperCase()}`;
        if (!buckets.has(key)) {
          buckets.set(key, { garment, color, sizes: {}, total: 0, jobs: [] });
        }
        const b = buckets.get(key);
        b.sizes[size] = (b.sizes[size] || 0) + qty;
        b.total += qty;
        if (job && job.jobId && !b.jobs.includes(job.jobId)) b.jobs.push(job.jobId);
      }
    }

    const out = Array.from(buckets.values()).map((b) => ({
      product: defaultProductFor(b.garment),
      garment: b.garment,
      color: b.color,
      sizes: b.sizes,
      total: b.total,
      jobs: b.jobs,
    }));
    out.sort((a, b) => b.total - a.total);
    console.log("[purchasingEngine] PURCHASE LIST BUILT:", out.length, "lines,", out.reduce((s, x) => s + x.total, 0), "units");
    return out;
  } catch (error) {
    console.error("[purchasingEngine] generatePurchaseList failed:", error && error.message ? error.message : error);
    return [];
  }
}

module.exports = {
  generatePurchaseList,
  defaultProductFor,
};
