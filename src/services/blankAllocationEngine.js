/**
 * Match requirements to inventory rows; compute allocations and shortages (no stock mutation).
 */

function matchKey(req, inv) {
  const rs = String(req.sku || "").trim().toLowerCase();
  const is = String(inv.sku || "").trim().toLowerCase();
  if (rs && is && rs === is) return true;
  const pc = `${String(req.product || "").toLowerCase()}|${String(req.color || "").toLowerCase()}|${String(req.size || "").toUpperCase()}`;
  const ic = `${String(inv.product || "").toLowerCase()}|${String(inv.color || "").toLowerCase()}|${String(inv.size || "").toUpperCase()}`;
  return pc === ic && pc.length > 5;
}

function allocateBlanks(requirements, inventory) {
  const invList = Array.isArray(inventory) ? inventory.map((r) => ({ ...r })) : [];
  const remaining = invList.map((r) => ({
    ...r,
    onHand: Math.max(0, Number(r.onHand) || 0),
    allocated: Math.max(0, Number(r.allocated) || 0),
  }));

  const allocations = [];
  const shortages = [];

  for (const req of Array.isArray(requirements) ? requirements : []) {
    const qtyRequired = Math.max(0, Number(req.qtyRequired) || 0);
    if (qtyRequired <= 0) continue;

    let idx = remaining.findIndex((inv) => matchKey(req, inv));
    let qtyAllocated = 0;

    if (idx >= 0) {
      const row = remaining[idx];
      const avail = Math.max(0, row.onHand - row.allocated);
      qtyAllocated = Math.min(qtyRequired, avail);
      row.allocated += qtyAllocated;
    }

    const qtyShort = qtyRequired - qtyAllocated;
    allocations.push({
      jobId: req.jobId,
      sku: req.sku,
      size: req.size,
      qtyRequired,
      qtyAllocated,
      qtyShort,
    });

    if (qtyShort > 0) {
      shortages.push({
        jobId: req.jobId,
        sku: req.sku,
        product: req.product,
        brand: req.brand,
        color: req.color,
        size: req.size,
        qtyShort,
        dueDate: req.dueDate || "",
        route: req.route,
        shipDirectToVendor: Boolean(req.shipDirectToVendor),
      });
    }
  }

  return { allocations, shortages };
}

module.exports = {
  allocateBlanks,
};
