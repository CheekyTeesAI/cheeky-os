/**
 * Operator console — GET /operator/:role
 * Cheeky OS v3.2 — GET /api/operator/top-actions, /needs-attention
 */
const express = require("express");
const router = express.Router();

const { getOperatorView } = require("../services/operatorViewService");
const { normalizeRole } = require("../config/roles");
const { getTopActions, getNeedsAttention } = require("../services/followupService");
const { logError } = require("../middleware/logger");

function sendView(req, res, role) {
  const r = normalizeRole(role);
  getOperatorView(r)
    .then((payload) => res.status(200).json({ success: true, ...payload }))
    .catch((e) =>
      res.status(200).json({
        success: false,
        error: e && e.message ? e.message : "operator_view_failed",
        role: r,
        sections: [],
      })
    );
}

router.get("/printer", (req, res) => sendView(req, res, "PRINTER"));
router.get("/admin", (req, res) => sendView(req, res, "ADMIN"));
router.get("/owner", (req, res) => sendView(req, res, "OWNER"));
router.get("/design", (req, res) => sendView(req, res, "DESIGN"));

router.get("/top-actions", async (_req, res) => {
  try {
    const out = await getTopActions(30);
    if (!out.success) {
      return res.status(503).json({
        success: false,
        error: out.error || "failed",
        code: out.code || "SERVICE_ERROR",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("GET /api/operator/top-actions", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.get("/needs-attention", async (_req, res) => {
  try {
    const out = await getNeedsAttention(50);
    if (!out.success) {
      return res.status(503).json({
        success: false,
        error: out.error || "failed",
        code: out.code || "SERVICE_ERROR",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("GET /api/operator/needs-attention", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
