const express = require("express");
const router = express.Router();

const { saveJob, getJobById, updateJob } = require("../data/store");
const { getArtFiles } = require("../services/storageService");
const {
  createFoundationJob,
  getFoundationJobByKey,
  transitionFoundationJobStatus,
  mapToLegacyJob,
} = require("../services/foundationJobService");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");
const { isFoundationDbAvailable } = require("../services/foundationPrisma");
const { logEvent } = require("../services/foundationEventLog");

router.get("/", async (_req, res) => {
  try {
    const jobs = await getOperatingSystemJobs();
    return res.status(200).json({
      success: true,
      count: jobs.length,
      jobs,
      foundation: isFoundationDbAvailable(),
    });
  } catch (error) {
    console.error("[jobs] GET / failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, count: 0, jobs: [], error: error && error.message ? error.message : "unknown_error" });
  }
});

router.post("/create", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const customerName = String(body.customerName || body.customer || "Unknown Customer");
    const items = Array.isArray(body.items) ? body.items : [];
    const notes = String(body.notes || "");
    const dueDate = body.dueDate ? new Date(body.dueDate).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const productionType = String(body.productionType || body.printMethod || "UNKNOWN").toUpperCase();
    const amount = Number(body.amount || 0);
    const depositPaid = body.depositPaid === true;

    const foundationPayload = {
      customerName,
      items,
      lineItems: items,
      notes,
      dueDate,
      printMethod: productionType,
      productionType,
      depositPaid,
      hasArt: body.hasArt === true,
      artFiles: Array.isArray(body.artFiles) ? body.artFiles : [],
    };

    const created = await createFoundationJob(foundationPayload);
    if (created.success && created.job) {
      const j = created.job;
      saveJob({
        jobId: j.jobId,
        customer: j.customer,
        lineItems: j.lineItems,
        notes,
        dueDate: j.dueDate,
        productionType: j.printMethod || productionType,
        printMethod: j.printMethod,
        amount,
        status: j.status,
        source: "manual+foundation",
        hasArt: j.hasArt,
        depositPaid: j.depositPaid,
        foundationStatus: j.foundationStatus,
      });
      return res.status(200).json({
        success: true,
        job: created.job,
        persisted: "foundation+store",
        foundation: true,
      });
    }

    const job = saveJob({
      customer: customerName,
      lineItems: items,
      notes,
      dueDate,
      productionType,
      amount,
      status: String(body.status || "UNPAID").toUpperCase(),
      source: "manual",
      hasArt: body.hasArt === true,
      artReady: body.artReady === true,
      artFiles: Array.isArray(body.artFiles) ? body.artFiles : [],
      depositPaid,
    });
    console.log("[jobs] JOB CREATED (store only):", job.jobId, customerName);
    return res.status(200).json({ success: true, job, persisted: "store", foundation: false, reason: created.reason || "foundation_unavailable" });
  } catch (error) {
    console.error("[jobs] POST /create failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, error: error && error.message ? error.message : "unknown_error" });
  }
});

const ALLOWED_SHOP_STATUSES = ["READY", "IN_PRODUCTION", "BLOCKED", "COMPLETED", "HOLD"];

function handleShopStatusUpdate(req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const jobId = String(body.jobId || body.id || "");
    const raw = String(body.status || body.shopStatus || "").toUpperCase().replace(/\s+/g, "_");
    if (!jobId) {
      return res.status(200).json({ success: false, reason: "jobId_required" });
    }
    if (!ALLOWED_SHOP_STATUSES.includes(raw)) {
      return res.status(200).json({ success: false, reason: "invalid_status", allowed: ALLOWED_SHOP_STATUSES });
    }
    const existing = getJobById(jobId);
    if (!existing) {
      return res.status(200).json({ success: false, reason: "not_found", jobId });
    }
    const { enforceAction, auditResult } = require("../services/securityEnforcement");
    const { ACTIONS } = require("../services/permissionService");
    const escalated = raw === "COMPLETED" || raw === "HOLD";
    const act = escalated ? ACTIONS.JOB_STATUS_ESCALATED : ACTIONS.JOB_STATUS;
    if (!enforceAction(req, res, act)) return;
    const updated = updateJob(jobId, {
      shopStatus: raw,
      shopStatusUpdatedAt: new Date().toISOString(),
    });
    console.log("[jobs/update-status] job:", jobId, "→", raw);
    auditResult(req, act, "updated", { jobId, status: raw });
    try {
      void logEvent(jobId, "JOB_SHOP_STATUS", String(raw));
    } catch (_e) {
      /* optional */
    }
    return res.status(200).json({ success: true, job: updated });
  } catch (error) {
    console.error("[jobs/update-status] failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, error: error && error.message ? error.message : "unknown_error" });
  }
}

router.post("/update-status", handleShopStatusUpdate);
router.post("/status", handleShopStatusUpdate);

/** Foundation OS status transitions (enum OsJobStatus). */
router.post("/:id/status", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const next = String(body.status || body.next || "").toUpperCase();
    if (!next) {
      return res.status(200).json({ success: false, reason: "status_required" });
    }
    const result = await transitionFoundationJobStatus(id, next);
    if (!result.success) {
      return res.status(200).json({ success: false, reason: result.reason || "transition_failed" });
    }
    const j = result.job;
    updateJob(id, {
      status: j.status,
      foundationStatus: j.foundationStatus,
      hasArt: j.hasArt,
      depositPaid: j.depositPaid,
    });
    return res.status(200).json({ success: true, job: j });
  } catch (error) {
    console.error("[jobs] POST /:id/status failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, error: error && error.message ? error.message : "unknown_error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const row = await getFoundationJobByKey(id);
    if (row) {
      const legacy = mapToLegacyJob(row);
      const artFiles = getArtFiles(id);
      return res.status(200).json({ success: true, job: { ...legacy, artFiles }, source: "foundation" });
    }
    const job = getJobById(id);
    if (!job) return res.status(200).json({ success: false, reason: "not_found", job: null });
    const artFiles = getArtFiles(id);
    return res.status(200).json({ success: true, job: { ...job, artFiles }, source: "store" });
  } catch (error) {
    console.error("[jobs] GET /:id failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, error: error && error.message ? error.message : "unknown_error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const updates = req.body && typeof req.body === "object" ? req.body : {};
    const updated = updateJob(id, updates);
    if (!updated) return res.status(200).json({ success: false, reason: "not_found", job: null });
    await logEvent(id, "JOB_PATCH", `PATCH ${JSON.stringify(Object.keys(updates))}`);
    return res.status(200).json({ success: true, job: updated });
  } catch (error) {
    console.error("[jobs] PATCH /:id failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, error: error && error.message ? error.message : "unknown_error" });
  }
});

module.exports = router;
