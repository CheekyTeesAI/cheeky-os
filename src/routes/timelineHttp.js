/**
 * GET /timeline/job/:jobId | /customer/:customerId | /recent
 */
const express = require("express");
const {
  getAggregatedForJob,
  getAggregatedForCustomer,
  getRecentTimeline,
} = require("../services/timelineService");

const router = express.Router();

router.get("/job/:jobId", (req, res) => {
  try {
    const jobId = String(req.params.jobId || "").trim();
    const events = getAggregatedForJob(jobId);
    return res.status(200).json({ success: true, time: new Date().toISOString(), jobId, events });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "timeline_job_failed" });
  }
});

router.get("/customer/:customerId", (req, res) => {
  try {
    const customerId = String(req.params.customerId || "").trim();
    const events = getAggregatedForCustomer(customerId);
    return res.status(200).json({ success: true, time: new Date().toISOString(), customerId, events });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "timeline_customer_failed",
    });
  }
});

router.get("/recent", (req, res) => {
  try {
    const since = req.query.since ? String(req.query.since) : "";
    const channel = req.query.channel ? String(req.query.channel) : "";
    const limit = req.query.limit ? Number(req.query.limit) : 80;
    const events = getRecentTimeline({ since, channel, limit });
    return res.status(200).json({ success: true, time: new Date().toISOString(), events });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "timeline_recent_failed" });
  }
});

module.exports = router;
