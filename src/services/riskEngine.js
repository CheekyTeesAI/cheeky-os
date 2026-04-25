/**
 * Operational and schedule risk — uses existing plan + production signals.
 */
const { loadExecutiveContext } = require("./executiveContextService");
const { hasArtFlag } = require("./priorityEngine");
const { evaluateJobPaymentStatus } = require("./paymentStatusEngine");

function hoursUntil(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (t - Date.now()) / (1000 * 3600);
}

function isDueSoon(iso, withinHours) {
  const h = hoursUntil(iso);
  if (h == null) return false;
  return h >= 0 && h <= withinHours;
}

async function analyzeRisks(ctx) {
  const c = ctx || (await loadExecutiveContext());
  const jobs = Array.isArray(c.jobs) ? c.jobs : [];
  const bundle = c.squareBundle && typeof c.squareBundle === "object" ? c.squareBundle : {};
  const unpaidInvoices = Array.isArray(bundle.unpaidInvoices) ? bundle.unpaidInvoices : [];
  const invById = new Map(unpaidInvoices.map((x) => [x.squareInvoiceId, x]));
  const plan = c.weeklyPlan || {};
  const week = Array.isArray(plan.week) ? plan.week : [];
  const blockedFromPlan = Array.isArray(plan.blocked) ? plan.blocked : [];
  const overflow = Array.isArray(plan.overflow) ? plan.overflow : [];
  const production = c.production && typeof c.production === "object" ? c.production : {};
  const prodBlocked = Array.isArray(production.blocked) ? production.blocked : [];

  const criticalRisks = [];
  const upcomingRisks = [];
  const blockedJobs = [];
  const overloadedDays = [];
  const vendorRisks = [];

  for (const d of week) {
    if (!d) continue;
    const st = String(d.capacityStatus || "").toUpperCase();
    if (st === "OVERLOADED" || st === "FULL") {
      overloadedDays.push({
        date: d.date,
        capacityStatus: d.capacityStatus,
        totalMinutes: d.totalMinutes,
        note: "Planner model shows tight/full capacity — verify shop reality.",
      });
    }
  }
  for (const o of overflow.slice(0, 25)) {
    overloadedDays.push({
      type: "UNSCHEDULED_IN_WINDOW",
      jobId: o.jobId,
      reason: o.reason || "no_capacity_slot",
      channel: o.channel,
    });
  }

  for (const b of blockedFromPlan.slice(0, 40)) {
    const rsn = b.reason || (Array.isArray(b.reasons) ? b.reasons[0] : null) || "plan_blocked";
    blockedJobs.push({
      jobId: b.jobId,
      reason: rsn,
      customer: b.customer,
      dueDate: b.dueDate || null,
    });
  }
  for (const b of prodBlocked.slice(0, 40)) {
    if (!blockedJobs.some((x) => x.jobId === b.jobId)) {
      const rsn = b.reason || (Array.isArray(b.reasons) ? b.reasons[0] : null) || "production_blocked";
      blockedJobs.push({
        jobId: b.jobId,
        reason: rsn,
        customer: b.customer,
        dueDate: b.dueDate || null,
      });
    }
  }

  for (const job of jobs) {
    if (!job || !job.jobId) continue;
    const row = job.squareInvoiceId ? invById.get(job.squareInvoiceId) : null;
    const squareData = row
      ? { hasSquareLink: true, amountDue: Number(row.amountDue) || 0, amountPaid: Number(row.amountPaid) || 0 }
      : { hasSquareLink: false, amountDue: 0, amountPaid: 0 };
    const ev = evaluateJobPaymentStatus(job, squareData);
    const due = job.dueDate;
    const h = hoursUntil(due);

    if (h != null && h < 0 && String(job.foundationStatus || "").toUpperCase() !== "COMPLETE") {
      criticalRisks.push({
        type: "PAST_DUE",
        jobId: job.jobId,
        customer: job.customer || job.customerName,
        dueDate: due,
        hoursLate: Math.round(-h),
      });
    } else if (isDueSoon(due, 48) && !hasArtFlag(job)) {
      upcomingRisks.push({
        type: "DUE_SOON_NOT_READY",
        jobId: job.jobId,
        customer: job.customer || job.customerName,
        dueDate: due,
        reason: "art_or_readiness",
      });
    } else if (isDueSoon(due, 72) && ev.paymentState === "BLOCKED_PAYMENT") {
      upcomingRisks.push({
        type: "DUE_SOON_BLOCKED_PAYMENT",
        jobId: job.jobId,
        customer: job.customer || job.customerName,
        dueDate: due,
      });
    }

    if (ev.paymentState === "BLOCKED_PAYMENT" || (!hasArtFlag(job) && String(job.foundationStatus || "").toUpperCase() !== "COMPLETE")) {
      /* already counted in blocked list via production; skip duplicate unless not in list */
    }
  }

  const outbound = c.outbound && typeof c.outbound === "object" ? c.outbound : {};
  const vendorStatus = Array.isArray(outbound.vendorOutboundStatus) ? outbound.vendorOutboundStatus : [];
  for (const v of vendorStatus) {
    if (v && String(v.sendStatus || "").toUpperCase() === "FAILED") {
      vendorRisks.push({
        poNumber: v.poNumber,
        supplier: v.supplier,
        lastError: v.lastError,
      });
    }
  }

  const shortages = c.purchasePlan && Array.isArray(c.purchasePlan.shortages) ? c.purchasePlan.shortages : [];
  if (shortages.length > 5) {
    vendorRisks.push({
      type: "material_shortage_volume",
      count: shortages.length,
      note: "Many shortage lines — purchasing may block production.",
    });
  }

  return {
    criticalRisks,
    upcomingRisks,
    blockedJobs,
    overloadedDays,
    vendorRisks,
    partialData: c.partial || [],
  };
}

module.exports = {
  analyzeRisks,
};
