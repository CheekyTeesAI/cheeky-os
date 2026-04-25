const express = require("express");
const router = express.Router();

const {
  previewPurchaseOrdersForSend,
  sendPurchaseOrder,
  previewBullseyeDirectShip,
  approveAndSend,
  getOutboundDashboardSlice,
} = require("../services/vendorOutboundEngine");

router.get("/preview", async (_req, res) => {
  try {
    const out = await previewPurchaseOrdersForSend();
    const dash = getOutboundDashboardSlice();
    return res.status(200).json({
      success: true,
      mock: Boolean(out.mock),
      ...out,
      ...dash,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      mock: true,
      error: e && e.message ? e.message : "preview_failed",
    });
  }
});

router.post("/send", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const poNumber = String(b.poNumber || "").trim();
    const mode = String(b.mode || "PREVIEW").toUpperCase();
    const approvalId = String(b.approvalId || "").trim();
    if (!poNumber) {
      return res.status(200).json({ success: false, sent: false, error: "poNumber_required" });
    }
    const { enforceAction, auditResult } = require("../services/securityEnforcement");
    const { ACTIONS } = require("../services/permissionService");
    const act = mode === "SEND" ? ACTIONS.VENDOR_SEND : ACTIONS.VENDOR_PREVIEW;
    if (!enforceAction(req, res, act)) return;
    const out = await sendPurchaseOrder(poNumber, mode, approvalId);
    auditResult(req, act, out.sent ? "sent" : "ok", { poNumber, mode });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      success: false,
      sent: false,
      mock: true,
      error: e && e.message ? e.message : "send_failed",
    });
  }
});

router.get("/pending", async (_req, res) => {
  try {
    const dash = getOutboundDashboardSlice();
    return res.status(200).json({ success: true, pendingApprovals: dash.pendingApprovals || [] });
  } catch (e) {
    return res.status(200).json({ success: false, pendingApprovals: [], error: e && e.message ? e.message : "error" });
  }
});

router.post("/approve", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const approvalId = String(b.approvalId || "").trim();
    if (!approvalId) {
      return res.status(200).json({ success: false, sent: false, error: "approvalId_required" });
    }
    const out = await approveAndSend(approvalId);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      success: false,
      sent: false,
      mock: true,
      error: e && e.message ? e.message : "approve_failed",
    });
  }
});

router.get("/bullseye-preview", async (req, res) => {
  try {
    const id = String(req.query.jobId || req.query.poNumber || "").trim();
    if (!id) {
      return res.status(200).json({ success: false, error: "jobId_or_poNumber_required" });
    }
    const out = await previewBullseyeDirectShip(id);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
