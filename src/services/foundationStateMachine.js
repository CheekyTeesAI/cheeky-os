/**
 * OsJobStatus transitions + deposit/art rules (foundation layer).
 */

const OsJobStatus = {
  INTAKE: "INTAKE",
  QUOTE: "QUOTE",
  DEPOSIT: "DEPOSIT",
  READY: "READY",
  PRINTING: "PRINTING",
  QC: "QC",
  COMPLETE: "COMPLETE",
  BLOCKED: "BLOCKED",
};

function normalizeStatus(s) {
  return String(s || "").toUpperCase().trim();
}

/** Compute initial DB status from business rules (never delete jobs). */
function initialStatus({ depositPaid, hasArt }) {
  if (!depositPaid || !hasArt) return OsJobStatus.BLOCKED;
  return OsJobStatus.INTAKE;
}

/** After load, ensure blocked if rules violated (read-time safety). */
function effectiveStatusForRules(jobRow) {
  const depositPaid = Boolean(jobRow.depositPaid);
  const hasArt = Array.isArray(jobRow.artFiles) && jobRow.artFiles.length > 0;
  if (!depositPaid || !hasArt) return OsJobStatus.BLOCKED;
  if (normalizeStatus(jobRow.status) === OsJobStatus.BLOCKED) return OsJobStatus.BLOCKED;
  return normalizeStatus(jobRow.status);
}

function canTransitionToPrinting(job) {
  const from = normalizeStatus(job.status);
  if (from !== OsJobStatus.READY) return { ok: false, reason: "ONLY_READY_CAN_ENTER_PRINTING" };
  if (!job.depositPaid) return { ok: false, reason: "DEPOSIT_REQUIRED" };
  const artCount = Array.isArray(job.artFiles) ? job.artFiles.length : 0;
  if (artCount < 1) return { ok: false, reason: "ART_REQUIRED" };
  return { ok: true };
}

function validateTransition(current, next, job) {
  const c = normalizeStatus(current);
  const n = normalizeStatus(next);
  if (!n || !Object.values(OsJobStatus).includes(n)) {
    return { ok: false, reason: "INVALID_STATUS" };
  }
  if (c === n) return { ok: true };

  if (n === OsJobStatus.PRINTING) {
    const gate = canTransitionToPrinting({ ...job, status: c });
    if (!gate.ok) return gate;
  }

  if (n === OsJobStatus.READY) {
    if (!job.depositPaid) return { ok: false, reason: "DEPOSIT_REQUIRED_FOR_READY" };
    const artCount = Array.isArray(job.artFiles) ? job.artFiles.length : 0;
    if (artCount < 1) return { ok: false, reason: "ART_REQUIRED_FOR_READY" };
  }

  return { ok: true };
}

module.exports = {
  OsJobStatus,
  initialStatus,
  effectiveStatusForRules,
  validateTransition,
  normalizeStatus,
};
