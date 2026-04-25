/**
 * Map natural language → focused purchasing response slices.
 */
function normalize(s) {
  return String(s || "").toLowerCase().trim();
}

function getPurchasingView(text) {
  const q = normalize(text);
  if (/fulfill\s+from\s+stock|from\s+stock|what\s+can\s+we\s+fulfill/i.test(q)) return "stock";
  if (/blocked\s+by\s+garments?|jobs?\s+blocked|garment\s+block/i.test(q)) return "blocked";
  if (/shortage|missing\s+blanks?|blanks?\s+missing|show\s+shortages/i.test(q)) return "shortages";
  if (/build\s+purchase|purchase\s+orders?|\bpo\b/i.test(q)) return "po";
  return "plan";
}

function summarizePurchasingView(view, plan) {
  const p = plan || {};
  switch (view) {
    case "shortages":
      return `${(p.shortages || []).length} shortage line(s) — see shortages[]`;
    case "blocked":
      return `${(p.garmentBlockedJobs || []).length} job(s) garment-blocked`;
    case "po":
      return `${(p.purchaseOrders || []).length} draft PO(s) ready — not sent`;
    case "stock":
      return `Allocated ${(p.allocations || []).filter((a) => a.qtyAllocated > 0).length} requirement line(s) from stock`;
    default:
      return `Purchase plan: ${(p.requirements || []).length} requirement(s), ${(p.shortages || []).length} shortage line(s)`;
  }
}

function slicePlanForView(view, plan) {
  const p = plan || {};
  if (view === "shortages") return { shortages: p.shortages, groupedPurchases: p.groupedPurchases };
  if (view === "blocked") return { garmentBlockedJobs: p.garmentBlockedJobs };
  if (view === "po") return { purchaseOrders: p.purchaseOrders };
  if (view === "stock") return { allocations: p.allocations, inventorySummary: p.inventorySummary };
  return {};
}

module.exports = {
  getPurchasingView,
  summarizePurchasingView,
  slicePlanForView,
};
