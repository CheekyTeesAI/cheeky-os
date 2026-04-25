/**
 * Shared shop workboard payload (used by GET /shop/board and POST /command).
 */
const { getInvoices } = require("./squareDataService");
const { normalizeInvoicesToJobs } = require("./jobNormalizer");
const { buildFullProductionReport } = require("./productionEngine");
const { upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("./foundationJobMerge");

function toCard(job, position, extras) {
  const ex = extras || {};
  return {
    jobId: job.jobId,
    customer: job.customer || "Unknown",
    dueDate: job.dueDate || null,
    printMethod: job.printMethod || job.productionType || "UNKNOWN",
    qty: Array.isArray(job.lineItems)
      ? job.lineItems.reduce((s, li) => s + (Number(li && li.qty) || 0), 0)
      : 0,
    color: Array.isArray(job.lineItems) && job.lineItems[0] ? (job.lineItems[0].color || null) : null,
    priority: Number(ex.priority ?? job.priority ?? job.priorityScore ?? 0),
    position: position ?? null,
    status: job.status || "UNPAID",
    shopStatus: job.shopStatus || null,
    notes: job.notes || "",
    reasons: Array.isArray(ex.reasons) ? ex.reasons : (Array.isArray(job.reasons) ? job.reasons : []),
    source: job.source || null,
    updatedAt: job.updatedAt || null,
  };
}

function dueCategory(iso) {
  if (!iso) return "future";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "future";
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const j0 = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (j0 < t0) return "overdue";
  if (j0 === t0) return "today";
  return "future";
}

async function buildShopBoardPayload() {
  const { invoices, mock, reason } = await getInvoices();
  upsertJobs(normalizeInvoicesToJobs(invoices));
  const jobs = await getOperatingSystemJobs();
  const production = buildFullProductionReport(jobs);

  const tasksById = new Map();
  (production.tasks || []).forEach((t) => tasksById.set(t.jobId, t));

  const readyMetaById = new Map();
  (production.ready || []).forEach((r, i) => readyMetaById.set(r.jobId, { position: i + 1, priority: r.priority ?? r.priorityScore ?? 0 }));
  const blockedMetaById = new Map();
  (production.blocked || []).forEach((b) => blockedMetaById.set(b.jobId, { reasons: b.reasons || (b.reason ? [b.reason] : []) }));

  const ready = [];
  const inProduction = [];
  const blocked = [];
  const completed = [];

  jobs.forEach((job) => {
    const shopStatus = String(job.shopStatus || "").toUpperCase();
    const rMeta = readyMetaById.get(job.jobId);
    const bMeta = blockedMetaById.get(job.jobId);

    if (shopStatus === "COMPLETED") {
      completed.push(toCard(job, null, { priority: rMeta ? rMeta.priority : 0 }));
      return;
    }
    if (shopStatus === "IN_PRODUCTION") {
      inProduction.push(toCard(job, null, { priority: rMeta ? rMeta.priority : 0 }));
      return;
    }
    if (shopStatus === "BLOCKED" || bMeta) {
      blocked.push(toCard(job, null, { reasons: bMeta ? bMeta.reasons : ["SHOP_BLOCKED"] }));
      return;
    }
    if (rMeta) {
      ready.push(toCard(job, rMeta.position, { priority: rMeta.priority }));
    }
  });

  ready.sort((a, b) => (a.position || 9999) - (b.position || 9999));
  inProduction.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const payload = {
    success: true,
    mock: Boolean(mock),
    counts: {
      ready: ready.length,
      inProduction: inProduction.length,
      blocked: blocked.length,
      completed: completed.length,
    },
    columns: {
      ready: ready.map((c) => ({ ...c, due: dueCategory(c.dueDate) })),
      inProduction: inProduction.map((c) => ({ ...c, due: dueCategory(c.dueDate) })),
      blocked: blocked.map((c) => ({ ...c, due: dueCategory(c.dueDate) })),
      completed: completed.map((c) => ({ ...c, due: dueCategory(c.dueDate) })),
    },
    tasksByJob: Object.fromEntries(tasksById),
    batches: production.batches || [],
    timestamp: new Date().toISOString(),
  };
  if (mock && reason) payload.reason = reason;
  return payload;
}

module.exports = { buildShopBoardPayload, dueCategory, toCard };
