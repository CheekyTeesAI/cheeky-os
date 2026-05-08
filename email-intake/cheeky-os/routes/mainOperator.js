"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");
const dashboardDataService = require("../dashboard/dashboardDataService");
const mainOperatorEngine = require("../operator/mainOperatorEngine");
const { buildProductionBoardPayload } = require("./productionBoard.route");
const approvalEngine = require("../workflow/approvalEngine");

const router = express.Router();

function actor(req) {
  try {
    if (req.body && req.body.requestedBy) return String(req.body.requestedBy).slice(0, 160);
    const h = req.headers && req.headers["x-actor"];
    return h ? String(h).slice(0, 160) : "http";
  } catch (_e) {
    return "http";
  }
}

function audit(req, routePath, meta) {
  try {
    safety.auditLog({
      eventType: "main_operator_v8",
      taskId: null,
      actor: actor(req),
      metadata: Object.assign({ route: routePath, readOnly: true }, meta || {}),
    });
  } catch (_e) {}
}

router.post("/api/operator/command", async (req, res) => {
  audit(req, "command", { readOnly: true });
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const out = await mainOperatorEngine.handleOperatorCommand({
      query: payload.query || payload.command || "",
      requestedBy: payload.requestedBy,
      mode: payload.mode,
    });
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/operator/today", async (_req, res) => {
  try {
    const main = await dashboardDataService.buildMainDashboard();
    return res.json({
      success: true,
      data: {
        todaysFocus: main.todaysFocus,
        approvals: main.approvals,
        garmentBoardSummary: main.garmentBoard
          ? {
              needingBlanks: main.garmentBoard.needingBlanks?.length,
              waitingReceipt: main.garmentBoard.waitingOnGarments?.length,
            }
          : {},
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/operator/blocks", async (_req, res) => {
  try {
    const b = await dashboardDataService.blockedOrdersSummary();
    return res.json({ success: true, data: b });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/operator/approvals", (req, res) => {
  try {
    audit(req, "approvals", {});
    const pending = approvalEngine.getPendingApprovals();
    return res.json({
      success: true,
      data: { count: pending.length, pending },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/operator/production-board", async (_req, res) => {
  try {
    const pb = await buildProductionBoardPayload();
    if (!pb.ok) return res.status(pb.error === "prisma_unavailable" ? 503 : 500).json(pb);
    return res.json({ success: true, data: pb });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/operator/cash-risks", async (_req, res) => {
  try {
    const c = await dashboardDataService.buildCashRisks();
    return res.json({ success: true, data: c });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

module.exports = router;
