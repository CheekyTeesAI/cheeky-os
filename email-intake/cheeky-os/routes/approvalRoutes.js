"use strict";

const express = require("express");
const crypto = require("crypto");

const approvalEngine = require("../workflow/approvalEngine");
const approvalGateService = require("../approvals/approvalGateService");
const safety = require("../agent/safetyGuard");
const { transportAuth } = require("../bridge/transportAuth");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();
router.use(express.json());

function optionalTransport(req, res, next) {
  const expected = String(process.env.CHEEKY_TRANSPORT_KEY || "").trim();
  if (!expected) return next();
  return transportAuth(req, res, next);
}

function correlationId() {
  try {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `corr-${Date.now()}`;
  } catch (_e) {
    return `corr-${Date.now()}`;
  }
}

function actorFrom(req) {
  try {
    const h = req.headers && req.headers["x-actor"];
    if (h) return String(h).trim().slice(0, 160);
    if (req.body && req.body.actor) return String(req.body.actor).trim().slice(0, 160);
    return "operator_http";
  } catch (_e) {
    return "operator_http";
  }
}

router.get("/pending", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const pending = approvalEngine.getPendingApprovals();
    let phase2Approvals = [];
    try {
      phase2Approvals = approvalGateService.getPendingApprovals();
    } catch (_p2) {
      phase2Approvals = [];
    }
    safety.auditLog({
      eventType: "approvals_pending_read",
      taskId: null,
      actor: actorFrom(req),
      correlationId: cid,
      metadata: {
        count: pending.length,
        phase2Count: phase2Approvals.length,
        route: "GET /api/approvals/pending",
      },
    });
    return res.json({
      success: true,
      data: {
        approvals: pending,
        phase2Approvals,
        phase2PendingCount: phase2Approvals.length,
        count: pending.length + phase2Approvals.length,
      },
      correlationId: cid,
    });
  } catch (e) {
    safety.auditLog({
      eventType: "approvals_pending_read_failed",
      taskId: null,
      actor: actorFrom(req),
      correlationId: cid,
      metadata: { error: e && e.message ? e.message : String(e) },
    });
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({
          safeMessage: "Could not read pending approvals safely.",
          technicalCode: "approvals_pending_failed",
          fallbackUsed: true,
        }),
        { correlationId: cid }
      )
    );
  }
});

router.get("/history", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const lim = Math.min(500, Math.max(10, Number(req.query.limit) || 200));
    const hist = approvalEngine.getApprovalHistory(lim);
    let phase2History = [];
    try {
      phase2History = approvalGateService.getApprovalHistory(lim);
    } catch (_h2) {
      phase2History = [];
    }
    safety.auditLog({
      eventType: "approvals_history_read",
      taskId: null,
      actor: actorFrom(req),
      correlationId: cid,
      metadata: { limit: lim, rows: hist.length, route: "GET /api/approvals/history" },
    });
    return res.json({
      success: true,
      data: { history: hist, count: hist.length, phase2History, phase2HistoryCount: phase2History.length },
      correlationId: cid,
    });
  } catch (e) {
    safety.auditLog({
      eventType: "approvals_history_read_failed",
      taskId: null,
      actor: actorFrom(req),
      correlationId: cid,
      metadata: { error: e && e.message ? e.message : String(e) },
    });
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({
          safeMessage: "Could not read approval history safely.",
          technicalCode: "approvals_history_failed",
          fallbackUsed: true,
        }),
        { correlationId: cid }
      )
    );
  }
});

router.post("/approve", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const actionId = String((req.body && (req.body.actionId || req.body.id)) || "").trim();
    const notes =
      req.body && req.body.notes != null
        ? String(req.body.notes).slice(0, 1200)
        : req.body && req.body.resolutionNotes != null
          ? String(req.body.resolutionNotes).slice(0, 1200)
          : null;
    const op = actorFrom(req);
    const out = approvalGateService.approveAction(actionId, op, notes);
    if (out.blocked) {
      return res.status(200).json({
        success: false,
        blocked: true,
        message: out.message || "Patrick approval required for this gated action.",
        approvalId: out.approvalId,
        pendingApprovalUrl: "/api/approvals/pending",
        correlationId: cid,
      });
    }
    if (!out.ok) {
      return res.status(200).json(
        Object.assign(
          safeFailureResponse({
            safeMessage: "Approve did not apply — verify action id.",
            technicalCode: String(out.error || "approve_gate_failed").slice(0, 79),
            fallbackUsed: false,
          }),
          { correlationId: cid }
        )
      );
    }
    return res.json({ success: true, data: { approval: out.approval }, correlationId: cid, source: "phase2_gate" });
  } catch (_eAp) {
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({
          safeMessage: "Phase 2 approve handler failed safely.",
          technicalCode: "phase2_approve_exception",
          fallbackUsed: true,
        }),
        { correlationId: cid }
      )
    );
  }
});

router.post("/reject", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const actionId = String((req.body && (req.body.actionId || req.body.id)) || "").trim();
    const reason =
      req.body && req.body.reason != null ? String(req.body.reason).slice(0, 1000) : "rejected_phase2_gate";
    const op = actorFrom(req);
    const out = approvalGateService.rejectAction(actionId, op, reason);
    if (out.blocked) {
      return res.status(200).json({
        success: false,
        blocked: true,
        message: out.message || "Patrick must reject this gated item.",
        approvalId: out.approvalId,
        pendingApprovalUrl: "/api/approvals/pending",
        correlationId: cid,
      });
    }
    if (!out.ok) {
      return res.status(200).json(
        Object.assign(
          safeFailureResponse({
            safeMessage: "Reject did not apply — verify action id.",
            technicalCode: String(out.error || "reject_gate_failed").slice(0, 79),
            fallbackUsed: false,
          }),
          { correlationId: cid }
        )
      );
    }
    return res.json({ success: true, data: { approval: out.approval }, correlationId: cid, source: "phase2_gate" });
  } catch (_eRj) {
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({
          safeMessage: "Phase 2 reject handler failed safely.",
          technicalCode: "phase2_reject_exception",
          fallbackUsed: true,
        }),
        { correlationId: cid }
      )
    );
  }
});

router.get("/:id", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(200).json(
        Object.assign(safeFailureResponse({ safeMessage: "Missing approval id.", technicalCode: "missing_id" }), { correlationId: cid })
      );
    }
    const row = approvalGateService.getApprovalById(id);
    if (!row) {
      return res.status(200).json(
        Object.assign(
          safeFailureResponse({
            safeMessage: "Approval not found in phase-2 gate store.",
            technicalCode: "approval_not_found_gate",
          }),
          { correlationId: cid, data: null }
        )
      );
    }
    return res.json({ success: true, data: row, correlationId: cid });
  } catch (_eG) {
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({
          safeMessage: "Could not fetch approval safely.",
          technicalCode: "approval_get_failed",
          fallbackUsed: true,
        }),
        { correlationId: cid }
      )
    );
  }
});

router.post("/:id/approve", optionalTransport, (req, res) => {
  const cid = correlationId();
  const approvalId = String(req.params.id || "").trim();
  if (!approvalId) {
    return res.status(400).json({ success: false, error: "missing_approval_id", correlationId: cid });
  }

  try {
    const out = approvalEngine.approveRequest(approvalId, actorFrom(req));
    safety.auditLog({
      eventType: "approval_decision",
      taskId: out && out.approval ? String(out.approval.taskId || "") || null : null,
      actor: actorFrom(req),
      correlationId: cid,
      metadata: {
        decision: "approve",
        approvalId,
        ok: Boolean(out.ok),
        error: out.error || null,
        route: "POST /api/approvals/:id/approve",
      },
    });

    try {
      const osm = require("../memory/operatorSessionMemory");
      osm.rememberInteraction("approval", { decision: "approve", approvalId, ok: out.ok });
    } catch (_m) {}

    if (!out.ok) {
      return res.status(out.error === "approval_not_found" ? 404 : 409).json({
        success: false,
        error: out.error || "approve_failed",
        correlationId: cid,
      });
    }
    return res.json({ success: true, data: { approval: out.approval }, correlationId: cid });
  } catch (e) {
    safety.auditLog({
      eventType: "approval_decision_error",
      taskId: null,
      actor: actorFrom(req),
      correlationId: cid,
      metadata: { decision: "approve", approvalId, error: e && e.message ? e.message : String(e) },
    });
    return res.status(500).json({ success: false, error: "approve_exception", correlationId: cid });
  }
});

router.post("/:id/reject", optionalTransport, (req, res) => {
  const cid = correlationId();
  const approvalId = String(req.params.id || "").trim();
  if (!approvalId) {
    return res.status(400).json({ success: false, error: "missing_approval_id", correlationId: cid });
  }

  const reason =
    req.body && req.body.reason != null
      ? String(req.body.reason).slice(0, 640)
      : "rejected_via_api";

  try {
    const out = approvalEngine.rejectRequest(approvalId, actorFrom(req), reason);
    safety.auditLog({
      eventType: "approval_decision",
      taskId: out && out.approval ? String(out.approval.taskId || "") || null : null,
      actor: actorFrom(req),
      correlationId: cid,
      metadata: {
        decision: "reject",
        approvalId,
        ok: Boolean(out.ok),
        error: out.error || null,
        reason,
        route: "POST /api/approvals/:id/reject",
      },
    });

    try {
      const osm = require("../memory/operatorSessionMemory");
      osm.rememberInteraction("approval", { decision: "reject", approvalId, ok: out.ok, reason });
    } catch (_m2) {}

    if (!out.ok) {
      return res.status(out.error === "approval_not_found" ? 404 : 409).json({
        success: false,
        error: out.error || "reject_failed",
        correlationId: cid,
      });
    }
    return res.json({ success: true, data: { approval: out.approval }, correlationId: cid });
  } catch (e) {
    safety.auditLog({
      eventType: "approval_decision_error",
      taskId: null,
      actor: actorFrom(req),
      correlationId: cid,
      metadata: { decision: "reject", approvalId, error: e && e.message ? e.message : String(e) },
    });
    return res.status(500).json({ success: false, error: "reject_exception", correlationId: cid });
  }
});

module.exports = router;
