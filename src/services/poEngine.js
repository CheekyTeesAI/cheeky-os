/**
 * Build draft purchase orders from grouped shortage lines.
 */
const { chooseSupplier } = require("./supplierDecisionEngine");

function poNumber(seq) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const n = String(seq).padStart(3, "0");
  return `PO-${y}${m}${day}-${n}`;
}

function groupKey(supplier, product, color) {
  return `${supplier}|${String(product || "").toLowerCase()}|${String(color || "").toLowerCase()}`;
}

function buildPurchaseOrders(groupedPurchases, opts) {
  const lines = Array.isArray(groupedPurchases) ? groupedPurchases : [];
  let seq = (opts && opts.startSeq) || 1;
  const buckets = new Map();

  for (const line of lines) {
    const dec = chooseSupplier(line, opts);
    const supplier = dec.supplier;
    const gk = groupKey(supplier, line.product, line.color);
    if (!buckets.has(gk)) {
      buckets.set(gk, {
        supplier,
        product: line.product,
        color: line.color,
        brand: line.brand,
        items: [],
        linkedJobs: new Set(),
        reason: dec.reason,
      });
    }
    const b = buckets.get(gk);
    b.items.push({
      sku: line.sku,
      product: line.product,
      color: line.color,
      size: line.size,
      qty: Math.max(0, Number(line.qtyShort) || 0),
    });
    if (line.jobId) b.linkedJobs.add(line.jobId);
  }

  const orders = [];
  for (const b of buckets.values()) {
    const totalUnits = b.items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    if (totalUnits <= 0) continue;
    orders.push({
      poNumber: poNumber(seq++),
      supplier: b.supplier,
      items: b.items.filter((it) => it.qty > 0),
      totalUnits,
      linkedJobs: Array.from(b.linkedJobs),
      notes: b.reason,
    });
  }

  return orders;
}

module.exports = {
  buildPurchaseOrders,
  poNumber,
};
