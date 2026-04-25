/**
 * Build Square-oriented draft payloads from intake / jobs — flags missing fields.
 */
const { getJobById } = require("../data/store");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { getIntakeById } = require("./intakeService");

async function resolveJob(jobId) {
  const id = String(jobId || "").trim();
  let j = getJobById(id);
  if (j) return j;
  try {
    const all = await getOperatingSystemJobs();
    return (Array.isArray(all) ? all : []).find((x) => x && x.jobId === id) || null;
  } catch (_e) {
    return null;
  }
}

function lineItemsFromJob(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  if (!items.length) {
    return [
      {
        name: "Custom order",
        quantity: 1,
        unitPrice: Number(process.env.CHEEKY_DEFAULT_UNIT_PRICE || 15),
      },
    ];
  }
  return items.map((it) => ({
    name: `${it.garment || it.product || "Item"}${it.color ? ` (${it.color})` : ""}`,
    quantity: Math.max(1, Number(it.qty || it.quantity) || 1),
    unitPrice: Number(process.env.CHEEKY_DEFAULT_UNIT_PRICE || 15),
  }));
}

async function buildQuotePayloadFromIntake(intakeId) {
  const rec = getIntakeById(intakeId);
  if (!rec) {
    return { payload: null, missingFields: ["intake_not_found"], readyForSquare: false, assumptions: [] };
  }
  const ex = rec.extractedData || {};
  const assumptions = Array.isArray(rec.assumptions) ? [...rec.assumptions] : [];
  const missing = [];
  if (!ex.email) missing.push("customer_email");
  if (!ex.quantity) missing.push("quantity");
  if (!ex.garment) missing.push("garment_or_product");

  const payload = {
    type: "QUOTE",
    customerName: ex.customerName || "Customer",
    customerEmail: ex.email || null,
    customerPhone: ex.phone || null,
    lineItems: [
      {
        name: `${ex.garment || "Custom"}${ex.colors && ex.colors.length ? ` — ${ex.colors.join(", ")}` : ""}`,
        quantity: Math.max(1, Number(ex.quantity) || 1),
        unitPrice: Number(process.env.CHEEKY_DEFAULT_UNIT_PRICE || 15),
      },
    ],
    notes: String(rec.rawBody || "").slice(0, 2000),
    dueDate: ex.dueDate || null,
    intakeId: rec.id,
  };

  return {
    payload,
    missingFields: missing,
    readyForSquare: missing.length === 0,
    assumptions,
  };
}

async function buildQuotePayloadFromJob(jobId) {
  const job = await resolveJob(jobId);
  if (!job) {
    return { payload: null, missingFields: ["job_not_found"], readyForSquare: false, assumptions: [] };
  }
  const lines = lineItemsFromJob(job);
  const missing = [];
  if (!job.customer && !job.customerName) missing.push("customer_name");

  const payload = {
    type: "QUOTE",
    customerName: job.customer || job.customerName || "Customer",
    customerEmail: job.fromEmail || job.email || null,
    lineItems: lines,
    notes: String(job.notes || "").slice(0, 2000),
    dueDate: job.dueDate || null,
    jobId: job.jobId,
  };

  return {
    payload,
    missingFields: missing,
    readyForSquare: missing.length === 0,
    assumptions: [],
  };
}

async function buildInvoicePayloadFromJob(jobId) {
  const job = await resolveJob(jobId);
  if (!job) {
    return { payload: null, missingFields: ["job_not_found"], readyForSquare: false, assumptions: [] };
  }
  const lines = lineItemsFromJob(job);
  const missing = [];
  if (!job.customer && !job.customerName) missing.push("customer_name");
  const qtyOk = lines.reduce((s, l) => s + l.quantity, 0) > 0;
  if (!qtyOk) missing.push("line_quantity");

  const payload = {
    type: "INVOICE",
    customerName: job.customer || job.customerName || "Customer",
    customerEmail: job.fromEmail || job.email || null,
    lineItems: lines,
    notes: String(job.notes || "").slice(0, 2000),
    dueDate: job.dueDate || null,
    jobId: job.jobId,
  };

  return {
    payload,
    missingFields: missing,
    readyForSquare: missing.length === 0,
    assumptions: [],
  };
}

module.exports = {
  buildQuotePayloadFromIntake,
  buildQuotePayloadFromJob,
  buildInvoicePayloadFromJob,
  resolveJob,
};
