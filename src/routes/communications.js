const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const {
  generateDepositReminder,
  generatePickupNotification,
  generateStatusUpdate,
} = require("../services/communicationService");

const { buildCommunicationRecommendations } = require("../services/communicationDecisionEngine");
const {
  previewCommunication,
  sendCommunication,
  previewRecommendedCommunications,
  sendApprovedCommunication,
} = require("../services/communicationOrchestrator");
const { listCommunications, countByStatusToday } = require("../services/communicationService");
const { getRelatedCommunicationTimeline } = require("../services/communicationHistoryService");

async function loadOrder(orderId) {
  const prisma = getPrisma();
  if (!prisma) return { error: "Database unavailable", code: "DB_UNAVAILABLE" };
  const order = await prisma.order.findUnique({ where: { id: String(orderId || "") } });
  if (!order) return { error: "Order not found", code: "ORDER_NOT_FOUND" };
  return { order, prisma };
}

router.post("/api/communications/deposit/:orderId", async (req, res) => {
  try {
    const found = await loadOrder(req.params.orderId);
    if (!found.order) return res.json({ success: false, error: found.error, code: found.code });
    const draft = await generateDepositReminder(found.order);
    if (req.body && req.body.approvedSend === true) {
      // future send hook goes here
    }
    return res.json({ success: true, data: draft });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "deposit_communication_failed",
      code: "DEPOSIT_COMMUNICATION_FAILED",
    });
  }
});

router.post("/api/communications/pickup/:orderId", async (req, res) => {
  try {
    const found = await loadOrder(req.params.orderId);
    if (!found.order) return res.json({ success: false, error: found.error, code: found.code });
    const draft = await generatePickupNotification(found.order);
    if (req.body && req.body.approvedSend === true) {
      // future send hook goes here
    }
    return res.json({ success: true, data: draft });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "pickup_communication_failed",
      code: "PICKUP_COMMUNICATION_FAILED",
    });
  }
});

router.post("/api/communications/status/:orderId", async (req, res) => {
  try {
    const found = await loadOrder(req.params.orderId);
    if (!found.order) return res.json({ success: false, error: found.error, code: found.code });
    const draft = await generateStatusUpdate(found.order);
    if (req.body && req.body.approvedSend === true) {
      // future send hook goes here
    }
    return res.json({ success: true, data: draft });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "status_communication_failed",
      code: "STATUS_COMMUNICATION_FAILED",
    });
  }
});

router.get("/api/communications/queue", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }
    const drafts = await prisma.revenueFollowup.findMany({
      where: {
        status: {
          in: ["READY", "APPROVED"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return res.json({ success: true, data: drafts });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "communication_queue_failed",
      code: "COMMUNICATION_QUEUE_FAILED",
    });
  }
});

async function buildDashboardCommunicationBundle() {
  const { recommendations, meta } = await buildCommunicationRecommendations();
  const pending = listCommunications({ status: "PENDING_APPROVAL", limit: 80 });
  const failed = listCommunications({ status: "FAILED", limit: 80 });
  const recent = listCommunications({ limit: 30 });
  const sentTodayCount = countByStatusToday("SENT");
  return {
    communicationSummary: {
      recommendedCount: (recommendations || []).length,
      pendingApprovalCount: pending.length,
      failedCount: failed.length,
      sentTodayCount,
      squareMock: Boolean(meta && meta.squareMock),
    },
    communicationRecommendations: recommendations || [],
    recentCommunications: recent,
    failedCommunications: failed,
  };
}

router.get("/", async (_req, res) => {
  try {
    const bundle = await buildDashboardCommunicationBundle();
    return res.status(200).json({ success: true, ...bundle });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "communications_error",
      communicationSummary: {
        recommendedCount: 0,
        pendingApprovalCount: 0,
        failedCount: 0,
        sentTodayCount: 0,
      },
      communicationRecommendations: [],
      recentCommunications: [],
      failedCommunications: [],
    });
  }
});

router.get("/recommendations", async (_req, res) => {
  try {
    const out = await buildCommunicationRecommendations();
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error", recommendations: [] });
  }
});

router.get("/history/:relatedType/:relatedId", (req, res) => {
  try {
    const tl = getRelatedCommunicationTimeline(req.params.relatedType, req.params.relatedId);
    return res.status(200).json({ success: true, ...tl });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e && e.message ? e.message : "error",
      relatedType: req.params.relatedType,
      relatedId: req.params.relatedId,
      timeline: [],
    });
  }
});

router.get("/pending", (_req, res) => {
  const rows = listCommunications({ status: "PENDING_APPROVAL", limit: 100 });
  return res.status(200).json({ success: true, count: rows.length, items: rows });
});

router.get("/failed", (_req, res) => {
  const rows = listCommunications({ status: "FAILED", limit: 100 });
  return res.status(200).json({ success: true, count: rows.length, items: rows });
});

router.post("/preview", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await previewCommunication(body);
    return res.status(200).json({ success: out.success !== false, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "preview_error" });
  }
});

router.post("/send", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const mode = String(body.mode || "PREVIEW").toUpperCase();
    const { enforceAction, auditResult } = require("../services/securityEnforcement");
    const { ACTIONS } = require("../services/permissionService");
    const act = mode === "SEND" ? ACTIONS.COMM_SEND : ACTIONS.COMM_PREVIEW;
    if (!enforceAction(req, res, act)) return;
    const out = await sendCommunication(body, mode, {
      confirmSend: body.confirmSend === true,
      approvalId: body.approvalId,
    });
    auditResult(req, act, out.sent ? "sent" : "completed", { mode });
    return res.status(200).json({
      success: out.success !== false,
      sent: Boolean(out.sent),
      ...out,
    });
  } catch (e) {
    return res.status(200).json({ success: false, sent: false, error: e && e.message ? e.message : "send_error" });
  }
});

router.post("/recommendations/send", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const rid = String(body.recommendationId || "").trim();
    const mode = String(body.mode || "PREVIEW").toUpperCase();
    if (!rid) {
      return res.status(200).json({ success: false, error: "recommendationId_required" });
    }
    if (mode === "PREVIEW") {
      const out = await previewCommunication(rid);
      return res.status(200).json({ success: out.success !== false, ...out });
    }
    const { recommendations } = await buildCommunicationRecommendations();
    const hit = (recommendations || []).find((r) => r.recommendationId === rid);
    if (!hit) {
      return res.status(200).json({ success: false, error: "recommendation_not_found" });
    }
    const out = await sendCommunication(
      {
        templateKey: hit.templateKey,
        relatedType: hit.relatedType,
        relatedId: hit.relatedId,
        channel: hit.channel,
      },
      "SEND",
      { confirmSend: body.confirmSend === true, approvalId: body.approvalId }
    );
    return res.status(200).json({
      success: Boolean(out.sent),
      sent: Boolean(out.sent),
      ...out,
    });
  } catch (e) {
    return res.status(200).json({ success: false, sent: false, error: e && e.message ? e.message : "error" });
  }
});

router.post("/approve-send", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const id = String(body.communicationId || "").trim();
    if (!id) return res.status(200).json({ success: false, error: "communicationId_required" });
    const out = await sendApprovedCommunication(id);
    return res.status(200).json({ success: Boolean(out.sent), ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
module.exports.buildDashboardCommunicationBundle = buildDashboardCommunicationBundle;
