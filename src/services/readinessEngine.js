/**
 * Job readiness for production (deposit, art, metadata).
 */
const { hasArtFlag } = require("./priorityEngine");

function evaluateJobReadiness(job) {
  const blockedReasons = [];
  if (!job) {
    return { ready: false, blockedReasons: ["NO_JOB"], assumptions: [] };
  }

  const assumptions = [];

  if (job.depositPaid === false) {
    blockedReasons.push("DEPOSIT_NOT_PAID");
  }
  if (!hasArtFlag(job)) {
    blockedReasons.push("ART_NOT_READY");
  }

  const pm = String(job.printMethod || job.productionType || "").toUpperCase();
  if (!pm || pm === "UNKNOWN") {
    assumptions.push("Print method UNKNOWN — planner will infer from qty/notes.");
  }

  const items = Array.isArray(job.lineItems) ? job.lineItems : [];
  const totalQty = items.reduce((sum, it) => sum + Number((it && it.qty) || 0), 0);
  const hasGarment = items.some((it) => it && it.garment) || Boolean(job.garment);
  if (totalQty <= 0 && !(Number(job.amount || 0) > 0)) {
    blockedReasons.push("MISSING_QUANTITY");
  }
  if (!hasGarment && items.length > 0) {
    blockedReasons.push("MISSING_GARMENT_INFO");
  }

  if (!job.dueDate) {
    assumptions.push("No due date on job — urgency scoring may be weaker.");
  }

  const fos = String(job.foundationStatus || "").toUpperCase();
  if (fos === "BLOCKED") {
    blockedReasons.push("FOUNDATION_BLOCKED");
  }

  return {
    ready: blockedReasons.length === 0,
    blockedReasons,
    assumptions,
  };
}

module.exports = {
  evaluateJobReadiness,
};
