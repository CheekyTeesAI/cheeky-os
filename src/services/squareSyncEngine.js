/**
 * Orchestrate Square pull + reconciliation + safe job patches.
 */
const fs = require("fs");
const path = require("path");

const { getSquareMode } = require("./squareConfigService");
const {
  getSquareInvoices,
  getSquareEstimates,
  getSquarePayments,
  getSquareCustomers,
} = require("./squareReadService");
const { reconcileSquareToSystem } = require("./financialReconciliationService");
const { evaluateJobPaymentStatus } = require("./paymentStatusEngine");
const { logEvent } = require("./foundationEventLog");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { updateJob } = require("../data/store");

const STATE = path.join(process.cwd(), "data", "square-sync-state.json");

function readState() {
  try {
    if (!fs.existsSync(STATE)) return {};
    return JSON.parse(fs.readFileSync(STATE, "utf8") || "{}");
  } catch (_e) {
    return {};
  }
}

function writeState(obj) {
  try {
    const dir = path.dirname(STATE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(obj, null, 2), "utf8");
  } catch (_e) {
    /* ignore */
  }
}

async function safeLog(msg) {
  try {
    await logEvent(null, "SQUARE_SYNC", String(msg || ""));
  } catch (_e) {
    console.log("[squareSync]", msg);
  }
}

async function syncFromSquare() {
  const mode = getSquareMode();
  await safeLog("Square sync started");

  const inv = await getSquareInvoices();
  const pay = await getSquarePayments();
  const cust = await getSquareCustomers();
  const recon = await reconcileSquareToSystem();

  const invById = new Map((inv.invoices || []).map((x) => [x.squareInvoiceId, x]));

  let updatedJobs = [];
  let flaggedIssues = [...(recon.duplicates || [])];

  try {
    const jobs = await getOperatingSystemJobs();
    for (const j of jobs || []) {
      if (!j || !j.jobId) continue;
      const sid = j.squareInvoiceId;
      const row = sid ? invById.get(sid) : null;
      const squareData = row
        ? {
            hasSquareLink: true,
            amountDue: row.amountDue,
            amountPaid: row.amountPaid,
          }
        : { hasSquareLink: false, amountDue: 0, amountPaid: 0 };

      const ev = evaluateJobPaymentStatus(j, squareData);
      const paymentState = ev.paymentState;
      const patch = {
        paymentState,
        amountPaid: ev.amountPaid,
        amountDue: ev.amountDue,
        lastSquareSyncAt: new Date().toISOString(),
      };
      const u = updateJob(j.jobId, patch);
      if (u) updatedJobs.push(j.jobId);
    }
  } catch (_e) {
    flaggedIssues.push({
      type: "SYNC_JOB_UPDATE_FAILED",
      severity: "medium",
      reason: "job_iteration_failed",
      recommendedAction: "check_logs",
    });
  }

  const out = {
    mode: mode.mode,
    configured: mode.configured,
    synced: true,
    mock: Boolean(inv.mock && pay.mock),
    updatedJobs,
    updatedCustomers: (recon.matchedCustomers || []).length,
    flaggedIssues,
    reconciliation: recon,
    invoiceCount: (inv.invoices || []).length,
    paymentCount: (pay.payments || []).length,
    customerCount: (cust.customers || []).length,
  };

  writeState({
    lastSquareSync: new Date().toISOString(),
    lastSummary: out,
  });

  await safeLog(`Square sync completed mock=${out.mock} jobs=${updatedJobs.length}`);
  return out;
}

async function syncCustomer(customerId) {
  await safeLog(`sync customer requested ${customerId}`);
  return { mode: getSquareMode().mode, synced: false, note: "per_customer_sync_minimal_stub" };
}

async function syncJobFinancialState(jobId) {
  const inv = await getSquareInvoices();
  const invById = new Map((inv.invoices || []).map((x) => [x.squareInvoiceId, x]));
  const j = (await getOperatingSystemJobs()).find((x) => x && x.jobId === jobId);
  if (!j) {
    return { success: false, error: "job_not_found" };
  }
  const row = j.squareInvoiceId ? invById.get(j.squareInvoiceId) : null;
  const squareData = row
    ? { hasSquareLink: true, amountDue: row.amountDue, amountPaid: row.amountPaid }
    : { hasSquareLink: false, amountDue: 0, amountPaid: 0 };
  const ev = evaluateJobPaymentStatus(j, squareData);
  updateJob(jobId, {
    paymentState: ev.paymentState,
    amountPaid: ev.amountPaid,
    amountDue: ev.amountDue,
    lastSquareSyncAt: new Date().toISOString(),
  });
  await safeLog(`job financial sync ${jobId} state=${ev.paymentState}`);
  return { success: true, jobId, evaluation: ev };
}

function getLastSyncMeta() {
  const s = readState();
  return {
    lastSquareSync: s.lastSquareSync || null,
    lastSummary: s.lastSummary || null,
  };
}

async function getSquareDashboardBundle() {
  const cfg = getSquareMode();
  const inv = await getSquareInvoices();
  const est = await getSquareEstimates();
  const unpaidInvoices = (inv.invoices || []).filter((i) => !/^PAID$/i.test(String(i.status || "")));
  const recon = await reconcileSquareToSystem();
  let jobs = [];
  try {
    jobs = await getOperatingSystemJobs();
  } catch (_e) {
    jobs = [];
  }
  const invById = new Map((inv.invoices || []).map((x) => [x.squareInvoiceId, x]));
  const paymentBlockedJobs = [];
  for (const j of jobs || []) {
    if (!j || !j.jobId) continue;
    const row = j.squareInvoiceId ? invById.get(j.squareInvoiceId) : null;
    const squareData = row
      ? { hasSquareLink: true, amountDue: row.amountDue, amountPaid: row.amountPaid }
      : { hasSquareLink: false, amountDue: 0, amountPaid: 0 };
    const ev = evaluateJobPaymentStatus(j, squareData);
    if (ev.paymentState === "BLOCKED_PAYMENT") paymentBlockedJobs.push({ jobId: j.jobId, evaluation: ev });
  }
  const meta = getLastSyncMeta();
  return {
    squareStatus: { ...cfg, mock: Boolean(inv.mock) },
    unpaidInvoices,
    openEstimates: est.estimates || [],
    paymentBlockedJobs,
    reconciliationIssues: [...(recon.duplicates || []), ...(recon.unmatchedSquareRecords || [])],
    lastSquareSync: meta.lastSquareSync,
  };
}

module.exports = {
  syncFromSquare,
  syncCustomer,
  syncJobFinancialState,
  getLastSyncMeta,
  getSquareDashboardBundle,
};
