"use strict";

const express = require("express");
const { planFromRequest, approveBuildRequest, statusResponse } = require("../services/flowApi");
const {
  buildFlowView,
  buildFlowSummary,
  updateFlowState,
  FLOW_ENGINE_META,
} = require("../../services/flowEngine.service");

const router = express.Router();

router.get("/api/flow/summary", async (req, res) => {
  try {
    const payload = await buildFlowSummary();
    return res.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err && err.message ? err.message : String(err),
      ...FLOW_ENGINE_META,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/api/flow/:orderId", async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId || ["plan", "approve-build", "status", "summary"].includes(orderId.toLowerCase())) {
    return res.status(404).json({
      success: false,
      error: "not_found",
      ...FLOW_ENGINE_META,
      timestamp: new Date().toISOString(),
    });
  }
  try {
    const payload = await buildFlowView(orderId);
    if ((payload.blockers || []).some((b) => b.code === "NOT_FOUND")) {
      return res.status(404).json({
        success: false,
        error: "order_not_found",
        orderId,
        ...FLOW_ENGINE_META,
        timestamp: new Date().toISOString(),
      });
    }
    return res.json({ ...payload, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err && err.message ? err.message : String(err),
      ...FLOW_ENGINE_META,
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/api/flow/:orderId/transition", async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  const event = (req.body && req.body.event) || req.query.event;
  if (!orderId) {
    return res.status(200).json({
      ok: false,
      error: "orderId_required",
      ...FLOW_ENGINE_META,
      timestamp: new Date().toISOString(),
    });
  }
  if (!event) {
    return res.status(200).json({
      ok: false,
      error: "event_required",
      orderId,
      ...FLOW_ENGINE_META,
      timestamp: new Date().toISOString(),
    });
  }
  try {
    const result = await updateFlowState(orderId, event);
    return res.json({
      ...result,
      ...FLOW_ENGINE_META,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      error: err && err.message ? err.message : String(err),
      orderId,
      ...FLOW_ENGINE_META,
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/api/flow/plan", async (req, res) => {
  try {
    const out = planFromRequest(req.body || {});
    if (out.executable) {
      return res.json({
        executable: true,
        reason: out.reason,
        nextStep: "execute",
        buildRequired: false,
        timestamp: new Date().toISOString(),
      });
    }
    return res.json({
      executable: false,
      buildRequired: true,
      reason: out.reason,
      missing: out.missing,
      intent: out.intent,
      manifest: out.manifest,
      flow: out.flow,
      buildPrompt: out.buildPrompt,
      buildId: out.buildId,
      nextStep: out.nextStep,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/api/flow/approve-build", async (req, res) => {
  try {
    const r = approveBuildRequest(req.body || {});
    if (!r.success) {
      return res.status(200).json({ success: false, error: r.error, timestamp: new Date().toISOString() });
    }
    return res.json({
      success: true,
      build: r.build,
      buildPrompt: r.buildPrompt,
      nextStep: r.nextStep,
      message: "Build approved. Implement in Cursor, verify, then set status to verified in tracker (future) or run manual tests.",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/api/flow/status/:id", async (req, res) => {
  try {
    const r = statusResponse(String(req.params.id || ""));
    if (!r.success) {
      return res.status(200).json({ success: false, error: r.error, timestamp: new Date().toISOString() });
    }
    return res.json({ ...r, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(200).json({
      success: false,
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
