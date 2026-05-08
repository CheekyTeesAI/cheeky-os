"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");
const wf = require("../operator/operatorWorkflowEngine");

const router = express.Router();

function audit(req, path) {
  try {
    safety.auditLog({
      eventType: "operator_workflow",
      taskId: null,
      actor: req.headers["x-actor"] ? String(req.headers["x-actor"]).slice(0, 160) : "http",
      metadata: { route: path, readOnly: true },
    });
  } catch (_e) {}
}

router.get("/api/intelligence/workflow/email-last", async (req, res) => {
  audit(req, "email-last");
  const contact = String(req.query.contact || "").trim();
  const corr = String(req.headers["x-correlation-id"] || "").trim() || "";
  try {
    if (!contact) return res.status(400).json({ success: false, error: "contact_required" });
    const payload = await wf.workflowLastEmailFromContact(contact, corr);
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "workflow_failed" });
  }
});

router.get("/api/intelligence/workflow/unpaid-summary", async (req, res) => {
  audit(req, "unpaid-summary");
  const corr = String(req.headers["x-correlation-id"] || "").trim() || "";
  try {
    const payload = await wf.workflowRiskyInvoices(corr);
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "workflow_failed" });
  }
});

router.get("/api/intelligence/workflow/late-production", (req, res) => {
  audit(req, "late-production");
  const corr = String(req.headers["x-correlation-id"] || "").trim() || "";
  try {
    const payload = wf.workflowLateProductionSummary(corr);
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "workflow_failed" });
  }
});

module.exports = router;
