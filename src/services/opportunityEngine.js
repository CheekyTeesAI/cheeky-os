/**
 * Revenue opportunities — intake, fast-turn, invoice-ready (no fabricated $).
 */
const { loadExecutiveContext } = require("./executiveContextService");
const { calculatePrice } = require("./pricingEngine");
const { hasArtFlag } = require("./priorityEngine");
const { evaluateJobPaymentStatus } = require("./paymentStatusEngine");

async function analyzeOpportunities(ctx) {
  const c = ctx || (await loadExecutiveContext());
  const jobs = Array.isArray(c.jobs) ? c.jobs : [];
  const intakes = Array.isArray(c.intakeRecords) ? c.intakeRecords : [];
  const bundle = c.squareBundle && typeof c.squareBundle === "object" ? c.squareBundle : {};
  const unpaidInvoices = Array.isArray(bundle.unpaidInvoices) ? bundle.unpaidInvoices : [];
  const invById = new Map(unpaidInvoices.map((x) => [x.squareInvoiceId, x]));

  const highValueOpportunities = [];
  const quickWins = [];
  const followUps = [];
  const upsellTargets = [];

  for (const rec of intakes) {
    if (!rec) continue;
    const st = String(rec.status || "").toUpperCase();
    if (st === "READY_FOR_QUOTE") {
      highValueOpportunities.push({
        type: "INTAKE_QUOTE",
        intakeId: rec.id,
        status: st,
        note: "Ready for quote — convert while hot.",
      });
    }
    if (st === "READY_FOR_JOB") {
      quickWins.push({
        type: "INTAKE_TO_JOB",
        intakeId: rec.id,
        status: st,
      });
    }
    if (st === "NEEDS_INFO" || st === "REVIEW_REQUIRED") {
      followUps.push({
        type: "INTAKE_FOLLOW_UP",
        intakeId: rec.id,
        status: st,
      });
    }
  }

  for (const job of jobs) {
    if (!job || !job.jobId) continue;
    const p = calculatePrice(job);
    const row = job.squareInvoiceId ? invById.get(job.squareInvoiceId) : null;
    const squareData = row
      ? { hasSquareLink: true, amountDue: Number(row.amountDue) || 0, amountPaid: Number(row.amountPaid) || 0 }
      : { hasSquareLink: false, amountDue: 0, amountPaid: 0 };
    const ev = evaluateJobPaymentStatus(job, squareData);
    const fs = String(job.foundationStatus || "").toUpperCase();

    if (fs === "COMPLETE" && row && Number(row.amountDue) > 0) {
      highValueOpportunities.push({
        type: "COLLECT_ON_COMPLETE",
        jobId: job.jobId,
        customer: job.customer || job.customerName,
        amountDue: Number(row.amountDue),
        modeledRevenue: p.price,
        priceSource: p.priceSource,
      });
    }

    if (hasArtFlag(job) && ev.paymentState === "PAYMENT_OK" && fs !== "COMPLETE") {
      quickWins.push({
        type: "READY_TO_PRODUCE",
        jobId: job.jobId,
        customer: job.customer || job.customerName,
        profit: p.profit,
      });
    }

    if (Number(p.profit) >= 300 && fs !== "COMPLETE") {
      upsellTargets.push({
        type: "HIGH_MARGIN_JOB",
        jobId: job.jobId,
        customer: job.customer || job.customerName,
        profit: p.profit,
        note: "Consider add-on sale or rush fee where appropriate.",
      });
    }

    if (row && Number(row.amountDue) > 0 && ev.paymentState === "PAYMENT_OK") {
      quickWins.push({
        type: "INVOICE_READY_TO_CLOSE",
        jobId: job.jobId,
        squareInvoiceId: job.squareInvoiceId,
        amountDue: Number(row.amountDue),
      });
    }
  }

  return {
    highValueOpportunities,
    quickWins,
    followUps,
    upsellTargets,
    partialData: c.partial || [],
  };
}

module.exports = {
  analyzeOpportunities,
};
