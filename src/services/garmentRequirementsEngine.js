/**
 * Flatten jobs → purchasable garment requirement lines.
 */
const { defaultProductFor } = require("./purchasingEngine");
const { buildVendorRouteInputFromJob, decideRoute } = require("./vendorRoutingService");

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function inferBrand(product) {
  const p = String(product || "");
  const m = p.match(/^([A-Za-z+&.]+)\s+/);
  return m ? m[1].replace(/\+/g, " ") : "Unknown";
}

function normalizeSize(s) {
  return String(s || "L").trim().toUpperCase() || "L";
}

function makeSku({ product, color, size, lineSku }) {
  if (lineSku && String(lineSku).trim()) return String(lineSku).trim();
  return `GEN:${slug(product)}|${slug(color)}|${normalizeSize(size)}`;
}

function routeLabel(job) {
  try {
    const input = buildVendorRouteInputFromJob(job);
    const d = decideRoute(input, { forceBullseye: false });
    return String(d.route || "IN_HOUSE").toUpperCase();
  } catch (_e) {
    return "IN_HOUSE";
  }
}

function buildGarmentRequirements(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const out = [];

  for (const job of list) {
    const status = String((job && job.status) || "").toUpperCase();
    if (status === "PAID") continue;
    const fss = String(job && job.foundationStatus ? job.foundationStatus : "").toUpperCase();
    if (fss === "COMPLETE") continue;

    const customer = job.customer || job.customerName || "Unknown";
    const due = job.dueDate ? String(job.dueDate) : "";
    const route = routeLabel(job);
    const shipDirect = route === "BULLSEYE";

    const items = Array.isArray(job.lineItems) ? job.lineItems : [];
    if (items.length === 0) {
      const qty = Math.max(0, Number(job.qty) || 0);
      if (qty <= 0) continue;
      const garment = job.garment || "APPAREL";
      const color = job.color || "UNSPECIFIED";
      const size = normalizeSize(job.size || "L");
      const product = defaultProductFor(garment);
      const sku = makeSku({ product, color, size, lineSku: job.sku });
      out.push({
        jobId: job.jobId,
        customer,
        sku,
        product,
        brand: inferBrand(product),
        color: String(color),
        size,
        qtyRequired: qty,
        dueDate: due,
        route,
        shipDirectToVendor: shipDirect,
      });
      continue;
    }

    for (const it of items) {
      const qty = Math.max(0, Number((it && it.qty) || (it && it.quantity) || 0));
      if (qty <= 0) continue;
      const garment = (it && it.garment) || (it && it.product) || "APPAREL";
      const color = (it && it.color) || "UNSPECIFIED";
      const size = normalizeSize((it && it.size) || "L");
      const product = defaultProductFor(garment);
      const sku = makeSku({ product, color, size, lineSku: it && it.sku });
      out.push({
        jobId: job.jobId,
        customer,
        sku,
        product,
        brand: inferBrand(product),
        color: String(color),
        size,
        qtyRequired: qty,
        dueDate: due,
        route,
        shipDirectToVendor: shipDirect,
      });
    }
  }

  return out;
}

module.exports = {
  buildGarmentRequirements,
};
