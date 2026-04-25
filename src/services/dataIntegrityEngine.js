const REQUIRED_JOB_FIELDS = ["jobId", "customer", "status"];

function validateJob(job, index) {
  const issues = [];
  if (!job || typeof job !== "object") {
    issues.push({ index, field: "*", reason: "not an object" });
    return { valid: false, issues };
  }
  for (const field of REQUIRED_JOB_FIELDS) {
    if (job[field] === undefined || job[field] === null || job[field] === "") {
      issues.push({ index, jobId: job.jobId || null, field, reason: "missing" });
    }
  }
  if (job.dueDate) {
    const t = new Date(job.dueDate).getTime();
    if (!Number.isFinite(t)) {
      issues.push({ index, jobId: job.jobId || null, field: "dueDate", reason: "invalid ISO date" });
    }
  }
  if (job.amount !== undefined && job.amount !== null && !Number.isFinite(Number(job.amount))) {
    issues.push({ index, jobId: job.jobId || null, field: "amount", reason: "not numeric" });
  }
  return { valid: issues.length === 0, issues };
}

function validateInvoice(inv, index) {
  const issues = [];
  if (!inv || typeof inv !== "object") {
    issues.push({ index, field: "*", reason: "not an object" });
    return { valid: false, issues };
  }
  if (!inv.id) issues.push({ index, field: "id", reason: "missing" });
  if (!inv.customer) issues.push({ index, field: "customer", reason: "missing" });
  if (!Number.isFinite(Number(inv.amount))) issues.push({ index, field: "amount", reason: "not numeric" });
  return { valid: issues.length === 0, issues };
}

function validateDataSource(source) {
  try {
    if (!source || typeof source !== "object") {
      return { validData: [], issues: [{ reason: "source is not an object" }], mock: true, total: 0, excluded: 0 };
    }
    const mock = Boolean(source.mock);
    const kind = source.kind || (Array.isArray(source.invoices) ? "invoices" : Array.isArray(source.jobs) ? "jobs" : "unknown");
    const items = Array.isArray(source.invoices) ? source.invoices
      : Array.isArray(source.jobs) ? source.jobs
      : Array.isArray(source.items) ? source.items
      : [];

    const validator = kind === "invoices" ? validateInvoice : validateJob;
    const validData = [];
    const issues = [];
    items.forEach((item, index) => {
      const result = validator(item, index);
      if (result.valid) validData.push(item);
      else issues.push(...result.issues);
    });

    if (issues.length > 0) {
      console.warn(`[dataIntegrity] ${kind}: ${issues.length} issue(s) across ${items.length} records`);
    }

    return {
      kind,
      validData,
      issues,
      mock,
      total: items.length,
      excluded: items.length - validData.length,
    };
  } catch (error) {
    console.error("[dataIntegrity] validateDataSource failed:", error && error.message ? error.message : error);
    return { kind: "unknown", validData: [], issues: [{ reason: "validator_error" }], mock: true, total: 0, excluded: 0 };
  }
}

module.exports = {
  validateDataSource,
  validateJob,
  validateInvoice,
};
