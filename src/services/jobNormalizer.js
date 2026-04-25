const { calculatePriority } = require("./priorityEngine");

function detectProductionType(source) {
  const text = String(source || "").toLowerCase();
  if (text.includes("screen")) return "SCREEN";
  if (text.includes("dtf")) return "DTF";
  if (text.includes("dtg")) return "DTG";
  if (text.includes("shirt") || text.includes("hoodie") || text.includes("tee")) return "DTG";
  return "UNKNOWN";
}

function detectPrintMethod(sources) {
  const text = String(sources || "").toLowerCase();
  if (text.includes("screen print") || text.includes("screenprint") || text.includes("silk screen")) return "SCREEN";
  if (text.includes("dtf")) return "DTF";
  if (text.includes("dtg") || text.includes("direct to garment")) return "DTG";
  if (text.includes("heat press") || text.includes("vinyl")) return "HEAT_PRESS";
  if (text.includes("embroider")) return "EMBROIDERY";
  if (text.includes("screen")) return "SCREEN";
  return "UNKNOWN";
}

function detectHasArt(inv) {
  if (!inv || typeof inv !== "object") return false;
  if (inv.hasArt === true) return true;
  if (inv.artReady === true) return true;
  if (Array.isArray(inv.artFiles) && inv.artFiles.length > 0) return true;
  return false;
}

function enrichWithScheduling(job, inv) {
  const notes = job && job.notes ? job.notes : (inv && inv.notes ? inv.notes : "");
  const description = inv && inv.description ? inv.description : "";
  const printMethod = detectPrintMethod(`${notes} ${description} ${job && job.productionType ? job.productionType : ""}`);
  const hasArt = detectHasArt({ ...(inv || {}), ...(job || {}) });
  const enriched = { ...job, printMethod, hasArt };
  enriched.priorityScore = calculatePriority(enriched);
  return enriched;
}

function normalizeInvoicesToJobs(invoices) {
  const list = Array.isArray(invoices) ? invoices : [];
  return list.map((inv, idx) => {
    const id = inv && inv.id ? inv.id : `JOB-${idx + 1}`;
    const customer = inv && inv.customer ? inv.customer : "Unknown Customer";
    const dueDate = inv && inv.dueDate ? inv.dueDate : new Date().toISOString();
    const status = String(inv && inv.status ? inv.status : "UNPAID").toUpperCase();
    const productionType = detectProductionType(`${customer} ${inv && inv.description ? inv.description : ""}`);
    const base = {
      jobId: `JOB-${id}`,
      customer,
      dueDate,
      status,
      productionType,
      amount: Number(inv && inv.amount ? inv.amount : 0),
      sourceInvoiceId: id,
    };
    return enrichWithScheduling(base, inv);
  });
}

function normalizeInvoiceToJob(invoice) {
  const inv = invoice && typeof invoice === "object" ? invoice : {};
  const id = inv.id ? inv.id : `UNKNOWN-${Date.now()}`;
  const customer = inv.customer || "Unknown Customer";
  const dueDate = inv.dueDate || new Date().toISOString();
  const status = String(inv.status || "UNPAID").toUpperCase();
  const productionType = detectProductionType(`${customer} ${inv.description || ""}`);
  const lineItems = Array.isArray(inv.lineItems) ? inv.lineItems : [];
  const base = {
    jobId: `JOB-${id}`,
    customer,
    dueDate,
    status,
    productionType,
    amount: Number(inv.amount || 0),
    lineItems,
    notes: inv.notes || "",
    sourceInvoiceId: id,
  };
  return enrichWithScheduling(base, inv);
}

module.exports = {
  normalizeInvoicesToJobs,
  normalizeInvoiceToJob,
  detectProductionType,
  detectPrintMethod,
  detectHasArt,
  enrichWithScheduling,
};
