/**
 * End-to-end purchase plan: requirements → allocation → shortages → draft POs.
 */
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { buildGarmentRequirements } = require("./garmentRequirementsEngine");
const { allocateBlanks } = require("./blankAllocationEngine");
const { getInventory } = require("./inventoryService");
const { buildPurchaseOrders } = require("./poEngine");
const { evaluateGarmentBlockers } = require("./shortageEngine");
const { buildWeeklyPlan } = require("./weekPlanner");
const { logEvent } = require("./foundationEventLog");
const { syncPurchaseOrdersFromPlan } = require("./poRegistryService");

function consolidateShortages(shortages) {
  const m = new Map();
  for (const s of Array.isArray(shortages) ? shortages : []) {
    const k = `${String(s.sku)}|${String(s.size)}|${String(s.product)}|${String(s.color)}`;
    if (!m.has(k)) {
      m.set(k, { ...s, qtyShort: 0 });
    }
    const row = m.get(k);
    row.qtyShort += Math.max(0, Number(s.qtyShort) || 0);
  }
  return Array.from(m.values()).filter((x) => x.qtyShort > 0);
}

async function logPurchase(msg) {
  try {
    await logEvent(null, "PURCHASING", msg);
  } catch (_e) {
    console.log("[purchasingPlanner]", msg);
  }
}

async function buildPurchasePlan(jobsInput) {
  let jobs = jobsInput;
  let mock = false;
  let degraded = false;
  try {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      jobs = await getOperatingSystemJobs();
    }
  } catch (e) {
    degraded = true;
    mock = true;
    jobs = [];
  }

  const assumptions = [
    "Inventory is file-backed (data/inventory.json) when present; empty means no stock on hand.",
    "SKU matching uses generated GEN: keys when line SKUs are absent.",
  ];

  let scheduledJobIds = [];
  try {
    const wp = await buildWeeklyPlan(jobs);
    mock = mock || Boolean(wp.mock);
    for (const d of wp.week || []) {
      for (const a of d.assignedJobs || []) {
        if (a.jobId) scheduledJobIds.push(a.jobId);
      }
    }
  } catch (_e) {
    assumptions.push("Week plan unavailable — scheduled job hints omitted.");
  }

  const requirements = buildGarmentRequirements(jobs);
  const inventory = getInventory();
  const { allocations, shortages } = allocateBlanks(requirements, inventory);
  const groupedPurchases = consolidateShortages(shortages);
  const purchaseOrders = buildPurchaseOrders(groupedPurchases, {});
  try {
    syncPurchaseOrdersFromPlan(purchaseOrders);
  } catch (_e) {
    assumptions.push("PO registry sync skipped (file error).");
  }
  const garmentBlockedJobs = evaluateGarmentBlockers(jobs, shortages);

  const inventorySummary = {
    skuCount: inventory.length,
    totalOnHand: inventory.reduce((s, x) => s + (Number(x.onHand) || 0), 0),
    totalAllocated: inventory.reduce((s, x) => s + (Number(x.allocated) || 0), 0),
    totalAvailable: inventory.reduce((s, x) => s + (Number(x.available) || 0), 0),
  };

  await logPurchase(
    `plan: req=${requirements.length} alloc=${allocations.length} short=${shortages.length} po=${purchaseOrders.length} blocked=${garmentBlockedJobs.length}`,
  );

  return {
    requirements,
    allocations,
    shortages,
    groupedPurchases,
    purchaseOrders,
    garmentBlockedJobs,
    scheduledJobIds,
    inventorySummary,
    assumptions,
    mock: Boolean(mock || degraded),
    degraded,
  };
}

module.exports = {
  buildPurchasePlan,
  consolidateShortages,
};
