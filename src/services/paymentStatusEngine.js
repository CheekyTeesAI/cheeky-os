/**
 * Job payment state from internal job + optional Square aggregates (no fabrication).
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function evaluateJobPaymentStatus(job, squareData) {
  const jobId = (job && job.jobId) || "UNKNOWN";
  const sd = squareData && typeof squareData === "object" ? squareData : {};
  const amountDue = num(sd.amountDue);
  const amountPaid = num(sd.amountPaid);
  const depositRequired = job && job.depositRequired === true;
  const depositAmount = num(job && job.depositAmount);
  const internalDeposit = job && job.depositPaid === true;

  const reasons = [];

  if (!sd.hasSquareLink && !internalDeposit && amountPaid === 0) {
    reasons.push("no_square_invoice_linked_and_no_internal_deposit_flag");
    return {
      jobId,
      paymentState: "PAYMENT_UNKNOWN",
      depositPaid: Boolean(internalDeposit),
      amountPaid: 0,
      amountDue: amountDue || null,
      reasons,
    };
  }

  if (depositRequired && !internalDeposit && amountPaid < Math.max(depositAmount, 1)) {
    reasons.push("deposit_required_not_satisfied");
    return {
      jobId,
      paymentState: "BLOCKED_PAYMENT",
      depositPaid: false,
      amountPaid,
      amountDue,
      reasons,
    };
  }

  if (amountDue > 0 && amountPaid > 0 && amountPaid < amountDue) {
    reasons.push("partial_payment_recorded");
    return {
      jobId,
      paymentState: "PARTIAL_PAYMENT",
      depositPaid: Boolean(internalDeposit || amountPaid > 0),
      amountPaid,
      amountDue,
      reasons,
    };
  }

  if (amountDue > 0 && amountPaid >= amountDue) {
    reasons.push("square_shows_fully_paid_or_covered");
    return {
      jobId,
      paymentState: "PAYMENT_OK",
      depositPaid: true,
      amountPaid,
      amountDue,
      reasons,
    };
  }

  reasons.push("insufficient_data_for_strict_state");
  return {
    jobId,
    paymentState: "PAYMENT_UNKNOWN",
    depositPaid: Boolean(internalDeposit),
    amountPaid,
    amountDue: amountDue || null,
    reasons,
  };
}

module.exports = { evaluateJobPaymentStatus };
