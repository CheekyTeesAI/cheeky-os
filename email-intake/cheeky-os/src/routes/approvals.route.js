"use strict";

const express = require("express");
const router = express.Router();
const approvalEngine = require("../operator/approvalEngine");

router.get("/api/operator/approvals", async (_req, res) => {
  try {
    return res.json(approvalEngine.list());
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: err && err.message ? err.message : String(err) });
  }
});

router.post("/api/operator/approvals/:id/approve", async (req, res) => {
  try {
    return res.json(approvalEngine.approve(req.params.id));
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: err && err.message ? err.message : String(err) });
  }
});

router.post("/api/operator/approvals/:id/reject", async (req, res) => {
  try {
    return res.json(approvalEngine.reject(req.params.id));
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, error: err && err.message ? err.message : String(err) });
  }
});

module.exports = router;
