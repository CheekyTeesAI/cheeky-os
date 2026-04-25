/**
 * Concise customer-facing status from real job state only.
 */
const { getJobById } = require("../data/store");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { evaluateJobPaymentStatus } = require("./paymentStatusEngine");
const { hasArtFlag } = require("./priorityEngine");
const { getSquareDashboardBundle } = require("./squareSyncEngine");

async function resolveJob(jobId) {
  const id = String(jobId || "").trim();
  let job = getJobById(id);
  if (!job) {
    try {
      const jobs = await getOperatingSystemJobs();
      job = (jobs || []).find((j) => j && j.jobId === id) || null;
    } catch (_e) {
      job = null;
    }
  }
  return job;
}

async function buildCustomerStatusAnswer(jobId) {
  const job = await resolveJob(jobId);
  if (!job) {
    return {
      canAnswer: false,
      subject: null,
      body: null,
      reason: "job_not_found",
    };
  }

  let bundle = {};
  try {
    bundle = await getSquareDashboardBundle();
  } catch (_e) {
    bundle = {};
  }
  const inv = job.squareInvoiceId
    ? (bundle.unpaidInvoices || []).find((i) => i && i.squareInvoiceId === job.squareInvoiceId)
    : null;
  const squareData = inv
    ? { hasSquareLink: true, amountDue: Number(inv.amountDue) || 0, amountPaid: Number(inv.amountPaid) || 0 }
    : { hasSquareLink: false, amountDue: 0, amountPaid: 0 };
  const pay = evaluateJobPaymentStatus(job, squareData);
  const fs = String(job.foundationStatus || job.teamExecutionPhase || "").toUpperCase();
  const artOk = hasArtFlag(job);

  if (pay.paymentState === "BLOCKED_PAYMENT") {
    return {
      canAnswer: true,
      subject: "Update on your order",
      body:
        "Thanks for checking in. We’re waiting on payment or deposit before we can schedule production. " +
        "Reply here if you need the payment link resent.",
      reason: null,
    };
  }

  if (!artOk && fs !== "COMPLETE") {
    return {
      canAnswer: true,
      subject: "Update on your order",
      body:
        "We’re currently waiting on print-ready artwork before we can move your job forward. " +
        "Reply with files or questions for our art team.",
      reason: null,
    };
  }

  if (fs === "COMPLETE" || String(job.teamPickupReady) === "true") {
    return {
      canAnswer: true,
      subject: "Your order is ready",
      body:
        "Your order is ready for pickup. Reply if you need shipping or have questions about hours.",
      reason: null,
    };
  }

  if (fs === "PRINTING" || fs === "QC" || String(job.teamExecutionPhase || "").toUpperCase() === "PRINTING") {
    return {
      canAnswer: true,
      subject: "Update on your order",
      body:
        "Your job is in production. We’re on track unless we’ve messaged you separately about a change.",
      reason: null,
    };
  }

  if (!fs && !job.teamExecutionPhase) {
    return {
      canAnswer: false,
      subject: null,
      body: null,
      reason: "insufficient_state_detail",
    };
  }

  return {
    canAnswer: true,
    subject: "Update on your order",
    body: "Thanks for checking in — your order is active in our system. We’ll update you if anything changes.",
    reason: null,
  };
}

module.exports = { buildCustomerStatusAnswer, resolveJob };
