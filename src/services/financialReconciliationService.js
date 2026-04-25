/**
 * Reconcile Square customers/invoices/payments to internal jobs & customers — flags only, no blind merge.
 */
const { readStore } = require("./customerMatchService");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const {
  getSquareCustomers,
  getSquareInvoices,
  getSquarePayments,
} = require("./squareReadService");

function normEmail(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

async function reconcileSquareToSystem() {
  const matchedCustomers = [];
  const matchedJobs = [];
  const unmatchedSquareRecords = [];
  const unmatchedInternalRecords = [];
  const duplicates = [];
  const paymentStatusUpdates = [];

  let customers = { customers: [], mock: true };
  let invoices = { invoices: [], mock: true };
  let payments = { payments: [], mock: true };

  try {
    customers = await getSquareCustomers();
  } catch (_e) {
    /* degraded */
  }
  try {
    invoices = await getSquareInvoices();
  } catch (_e) {
    /* degraded */
  }
  try {
    payments = await getSquarePayments();
  } catch (_e) {
    /* degraded */
  }

  const internalCustomers = readStore();
  let jobs = [];
  try {
    jobs = await getOperatingSystemJobs();
  } catch (_e) {
    jobs = [];
  }

  const squareByEmail = new Map();
  for (const c of customers.customers || []) {
    const em = normEmail(c.email);
    if (em) {
      if (squareByEmail.has(em)) {
        duplicates.push({
          type: "DUPLICATE_SQUARE_EMAIL",
          severity: "medium",
          internalId: null,
          squareId: c.squareCustomerId,
          reason: "multiple Square customers share resolution key",
          recommendedAction: "merge_in_square_dashboard",
        });
      } else {
        squareByEmail.set(em, c);
      }
    }
  }

  for (const ic of internalCustomers) {
    const em = normEmail(ic.email);
    if (em && squareByEmail.has(em)) {
      const sc = squareByEmail.get(em);
      if (ic.squareCustomerId && ic.squareCustomerId !== sc.squareCustomerId) {
        duplicates.push({
          type: "CUSTOMER_ID_MISMATCH",
          severity: "high",
          internalId: ic.id,
          squareId: sc.squareCustomerId,
          reason: "internal squareCustomerId does not match email-resolved Square customer",
          recommendedAction: "manual_review",
        });
      } else {
        matchedCustomers.push({
          internalCustomerId: ic.id,
          squareCustomerId: sc.squareCustomerId,
          matchKey: "EMAIL",
        });
      }
    } else if (ic.email) {
      unmatchedInternalRecords.push({
        kind: "customer",
        id: ic.id,
        reason: "no_square_customer_with_same_email",
      });
    }
  }

  const invByJobHint = new Map();
  for (const inv of invoices.invoices || []) {
    const linked = jobs.find(
      (j) =>
        j &&
        (j.squareInvoiceId === inv.squareInvoiceId ||
          (j.notes && String(j.notes).includes(inv.squareInvoiceId || ""))),
    );
    if (linked) {
      matchedJobs.push({ jobId: linked.jobId, squareInvoiceId: inv.squareInvoiceId, matchKey: "STORED_ID_OR_NOTES" });
    } else {
      unmatchedSquareRecords.push({
        kind: "invoice",
        id: inv.squareInvoiceId,
        reason: "no_internal_job_linked",
      });
    }
    if (inv.squareInvoiceId) invByJobHint.set(inv.squareInvoiceId, inv);
  }

  for (const j of jobs) {
    if (j.squareInvoiceId && !invByJobHint.has(j.squareInvoiceId)) {
      unmatchedInternalRecords.push({
        kind: "job",
        id: j.jobId,
        reason: "squareInvoiceId_on_job_not_found_in_last_square_fetch",
      });
    }
    if (!j.squareInvoiceId) {
      paymentStatusUpdates.push({
        jobId: j.jobId,
        note: "no_square_invoice_id_on_job",
      });
    }
  }

  return {
    matchedCustomers,
    matchedJobs,
    unmatchedSquareRecords,
    unmatchedInternalRecords,
    duplicates,
    paymentStatusUpdates,
    mock: Boolean(customers.mock && invoices.mock),
  };
}

module.exports = { reconcileSquareToSystem };
