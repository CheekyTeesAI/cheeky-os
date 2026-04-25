/**
 * Cash-oriented view — uses Square + job payment state; no invented amounts.
 */
const { loadExecutiveContext } = require("./executiveContextService");
const { evaluateJobPaymentStatus } = require("./paymentStatusEngine");
const { calculatePrice } = require("./pricingEngine");

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isOverdueDueDate(iso) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return t < start.getTime();
}

/**
 * @param {object} [ctx] from loadExecutiveContext()
 */
async function analyzeCashflow(ctx) {
  const c = ctx || (await loadExecutiveContext());
  const assumptions = [...(c.assumptions || [])];
  const jobs = Array.isArray(c.jobs) ? c.jobs : [];
  const bundle = c.squareBundle && typeof c.squareBundle === "object" ? c.squareBundle : {};
  const unpaidInvoices = Array.isArray(bundle.unpaidInvoices) ? bundle.unpaidInvoices : [];
  const invById = new Map(unpaidInvoices.map((x) => [x.squareInvoiceId, x]));

  let totalOutstanding = 0;
  const overdueInvoices = [];
  const highPriorityCollections = [];
  const depositsNeeded = [];
  const cashAtRisk = [];
  const quickCashOpportunities = [];

  for (const inv of unpaidInvoices) {
    if (!inv || /^PAID$/i.test(String(inv.status || ""))) continue;
    const due = num(inv.amountDue);
    totalOutstanding += due;
    const row = {
      squareInvoiceId: inv.squareInvoiceId || inv.id || null,
      amountDue: due,
      status: inv.status || "UNPAID",
      dueDate: inv.dueDate || null,
      customerName: inv.customerName || null,
    };
    if (isOverdueDueDate(inv.dueDate) || String(inv.status || "").toUpperCase() === "OVERDUE") {
      overdueInvoices.push(row);
      if (due >= 500) highPriorityCollections.push({ ...row, reason: "overdue_or_past_due_threshold" });
    } else if (due >= 1000) {
      highPriorityCollections.push({ ...row, reason: "large_open_balance" });
    }
  }

  for (const job of jobs) {
    if (!job || !job.jobId) continue;
    const row = invById.get(job.squareInvoiceId);
    const squareData = row
      ? { hasSquareLink: true, amountDue: num(row.amountDue), amountPaid: num(row.amountPaid) }
      : { hasSquareLink: false, amountDue: 0, amountPaid: 0 };
    const ev = evaluateJobPaymentStatus(job, squareData);
    const price = calculatePrice(job);

    if (ev.paymentState === "BLOCKED_PAYMENT") {
      depositsNeeded.push({
        jobId: job.jobId,
        customer: job.customer || job.customerName || "Unknown",
        paymentState: ev.paymentState,
        amountDue: ev.amountDue,
        modeledPrice: num(price.price),
        priceSource: price.priceSource || "modeled",
      });
    }

    const fs = String(job.foundationStatus || "").toUpperCase();
    const st = String(job.status || "").toUpperCase();
    const completeLike = fs === "COMPLETE" || (st === "PAID" && row && num(row.amountDue) > 0);
    if (completeLike && row && num(row.amountDue) > 0.01) {
      cashAtRisk.push({
        jobId: job.jobId,
        customer: job.customer || job.customerName,
        amountDue: num(row.amountDue),
        note: "Complete/near-complete work with open balance per Square link — verify before collecting.",
      });
    }

    if (
      ev.paymentState === "PARTIAL_PAYMENT" ||
      (row && num(row.amountDue) > 0 && num(row.amountPaid) > 0)
    ) {
      quickCashOpportunities.push({
        jobId: job.jobId,
        customer: job.customer || job.customerName,
        amountDue: row ? num(row.amountDue) : num(ev.amountDue),
        reason: "partial_payment — follow up for remainder",
      });
    }
  }

  const intakes = Array.isArray(c.intakeRecords) ? c.intakeRecords : [];
  for (const rec of intakes) {
    if (!rec) continue;
    const st = String(rec.status || "").toUpperCase();
    if (st === "READY_FOR_QUOTE" || st === "READY_FOR_JOB") {
      quickCashOpportunities.push({
        intakeId: rec.id,
        reason: "intake_ready_to_convert",
        status: st,
      });
    }
  }

  if (bundle.squareStatus && bundle.squareStatus.mock) {
    assumptions.push("Square bundle is mock or degraded — verify amounts in Square.");
  }

  return {
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    overdueInvoices,
    highPriorityCollections,
    depositsNeeded,
    cashAtRisk,
    quickCashOpportunities,
    assumptions,
    partialData: c.partial || [],
  };
}

module.exports = {
  analyzeCashflow,
};
