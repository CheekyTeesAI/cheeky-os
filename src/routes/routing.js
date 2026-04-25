const express = require("express");
const router = express.Router();

const { getInvoices } = require("../services/squareDataService");
const { normalizeInvoicesToJobs } = require("../services/jobNormalizer");
const { routeJob } = require("../services/routingEngine");
const { chooseVendor } = require("../services/vendorEngine");
const { upsertJobs } = require("../data/store");
const { getOperatingSystemJobs } = require("../services/foundationJobMerge");

router.get("/decisions", async (req, res) => {
  try {
    const { invoices, mock, reason } = await getInvoices();
  upsertJobs(normalizeInvoicesToJobs(invoices));
  const all = await getOperatingSystemJobs();
  const jobs = all.filter((j) => String(j.status || "").toUpperCase() !== "PAID");
    const decisions = jobs.map((job) => {
      const route = routeJob(job);
      const vendor = chooseVendor(job);
      return {
        jobId: job.jobId,
        customer: job.customer,
        status: job.status,
        dueDate: job.dueDate,
        currentMethod: job.printMethod || job.productionType || "UNKNOWN",
        recommendedMethod: route.method,
        location: route.location,
        vendor: vendor.vendor,
        qty: route.qty,
        colors: route.colors,
        routingReasons: route.reasons,
        vendorReasons: vendor.reasons,
      };
    });
    console.log("[routing/decisions] produced:", decisions.length, mock ? `MOCK(${reason || "no-token"})` : "LIVE");
    const payload = {
      success: true,
      count: decisions.length,
      decisions,
      mock: Boolean(mock),
    };
    if (mock && reason) payload.reason = reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[routing/decisions] failed:", error && error.message ? error.message : error);
    return res.status(200).json({ success: false, count: 0, decisions: [], mock: true, error: error && error.message ? error.message : "unknown_error" });
  }
});

module.exports = router;
