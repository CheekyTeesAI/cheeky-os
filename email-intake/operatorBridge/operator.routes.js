"use strict";

/**
 * Operator Bridge — Express Router
 * Thin route layer. Validates input, calls service, returns JSON.
 * Mount at: app.use("/api/operator", require("./operatorBridge/operator.routes"))
 *
 * Endpoints:
 *   GET  /api/operator/health
 *   GET  /api/operator/capabilities
 *   GET  /api/operator/context
 *   POST /api/operator/command/preview
 *   POST /api/operator/command/execute
 *   GET  /api/operator/audit
 */

const express = require("express");
const path = require("path");

const operatorService = require("./operator.service");
const { validateCommandInput } = require("./operator.schemas");
const { getCapabilities } = require("./operator.capabilities");

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Optional auth guard
// ─────────────────────────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const bridgeKey = process.env.OPERATOR_BRIDGE_KEY;
  if (!bridgeKey) {
    // No key configured — allow but note in health response
    return next();
  }
  const provided = req.headers["x-operator-key"] || req.headers["x-operator-bridge-key"];
  if (!provided || provided !== bridgeKey) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
      detail: "x-operator-key header is required and must match OPERATOR_BRIDGE_KEY.",
    });
  }
  return next();
}

router.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────

router.get("/health", (_req, res) => {
  const keySet = Boolean(process.env.OPERATOR_BRIDGE_KEY);
  const response = {
    ok: true,
    service: "cheeky-os-operator-bridge",
    version: "1.0.0",
    mode: "safe",
    timestamp: new Date().toISOString(),
    pilotMode: String(process.env.CHEEKY_PILOT_MODE || "")
      .trim()
      .toLowerCase() === "true",
    /** When true, approved outreach routes may send; pilot expects false. */
    autoSendOutbound: String(process.env.AUTO_SEND || "").trim().toLowerCase() === "true",
    capabilities: {
      readContext: true,
      previewCommands: true,
      executeSafeCommands: true,
      auditLog: true,
    },
  };
  if (!keySet) {
    response.securityWarning = "OPERATOR_BRIDGE_KEY is not set. Bridge is accessible without authentication. Set OPERATOR_BRIDGE_KEY in .env for production use.";
  }
  return res.json(response);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /capabilities
// ─────────────────────────────────────────────────────────────────────────────

router.get("/capabilities", (_req, res) => {
  try {
    return res.json(getCapabilities());
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Failed to load capabilities.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

router.get("/context/full", async (_req, res) => {
  try {
    const aggregatePath = path.join(__dirname, "..", "cheeky-os", "services", "operator.context.aggregate.service");
    const { buildOperatorContext } = require(aggregatePath);
    const generatedAt = new Date().toISOString();
    const context = await buildOperatorContext();
    return res.json({
      success: true,
      generatedAt,
      context,
    });
  } catch (err) {
    console.error("[operator-bridge] /context/full error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      success: false,
      error: "Full context load failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /actions/send-followup/:id  (explicit operator send only)
// ─────────────────────────────────────────────────────────────────────────────

router.post("/actions/send-followup/:id", async (req, res) => {
  try {
    const followupSend = require(path.join(__dirname, "..", "cheeky-os", "services", "followup.send.service"));
    const draftId = req.params.id;
    const approvedBy =
      (req.body && (req.body.approvedBy || req.body.requestedBy)) || "operator";
    const result = await followupSend.sendDraft(draftId, { approvedBy });
    if (result.ok) {
      console.log("[operator-bridge] send-followup OK", draftId);
    } else {
      console.warn("[operator-bridge] send-followup failed", draftId, result.status, result.message || result.error);
    }
    return res.json({ success: result.ok, result });
  } catch (err) {
    console.error("[operator-bridge] send-followup error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /actions/send-all-followups
// ─────────────────────────────────────────────────────────────────────────────

router.post("/actions/send-all-followups", async (req, res) => {
  try {
    const store = require(path.join(__dirname, "..", "cheeky-os", "services", "followup.store"));
    const followupSend = require(path.join(__dirname, "..", "cheeky-os", "services", "followup.send.service"));
    const approvedBy =
      (req.body && (req.body.approvedBy || req.body.requestedBy)) || "operator";

    const draftOnly = store.getDrafts("draft");
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const details = [];

    for (const d of draftOnly) {
      const r = await followupSend.sendDraft(d.id, { approvedBy });
      if (r.status === "not_found") {
        skipped++;
        details.push({ id: d.id, outcome: "skipped", reason: "not_found" });
      } else if (r.status === "already_sent") {
        skipped++;
        details.push({ id: d.id, outcome: "skipped", reason: "already_sent" });
      } else if (r.ok) {
        sent++;
        details.push({ id: d.id, outcome: "sent" });
      } else {
        failed++;
        details.push({ id: d.id, outcome: "failed", error: r.error || r.message });
      }
    }

    console.log(
      `[operator-bridge] send-all-followups: sent=${sent} failed=${failed} skipped=${skipped} (draft batch size ${draftOnly.length})`
    );

    return res.json({
      success: true,
      sent,
      failed,
      skipped,
      totalDrafts: draftOnly.length,
      details,
    });
  } catch (err) {
    console.error("[operator-bridge] send-all-followups error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /actions/create-quote-draft/:inboundId
// ─────────────────────────────────────────────────────────────────────────────

router.post("/actions/create-quote-draft/:inboundId", async (req, res) => {
  try {
    const inboundStore = require(path.join(__dirname, "..", "cheeky-os", "services", "inbound.store"));
    const { buildCloserReviewForMessage } = require(path.join(
      __dirname,
      "..",
      "cheeky-os",
      "services",
      "closer.review.pack"
    ));
    const bridge = require(path.join(__dirname, "..", "cheeky-os", "services", "order-draft.bridge.service"));

    const inboundId = req.params.inboundId;
    const message = inboundStore.getInboundById(inboundId);
    if (!message) {
      return res.status(404).json({ success: false, error: `Inbound ${inboundId} not found.` });
    }

    const review = buildCloserReviewForMessage(message);
    const quoteDraft = bridge.createQuoteDraftFromCloserReview(review);
    if (!quoteDraft) {
      return res.status(400).json({
        success: false,
        error: "No convertible order draft for this message (needs quote/order classification).",
      });
    }

    bridge.persistQuoteDraft(quoteDraft);
    console.log("[operator-bridge] quote draft saved for inbound", inboundId);

    return res.json({ success: true, quoteDraft });
  } catch (err) {
    console.error("[operator-bridge] create-quote-draft error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /context
// ─────────────────────────────────────────────────────────────────────────────

router.get("/context", async (_req, res) => {
  try {
    const context = await operatorService.getOperatorContext();
    return res.json(context);
  } catch (err) {
    console.error("[operator-bridge] /context error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Context load failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /command/preview
// ─────────────────────────────────────────────────────────────────────────────

router.post("/command/preview", async (req, res) => {
  try {
    const validation = validateCommandInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        errors: validation.errors,
        hint: "Provide: { commandType, intent, payload, requestedBy }",
      });
    }

    const result = await operatorService.previewCommand(req.body);
    return res.json(result);
  } catch (err) {
    console.error("[operator-bridge] /command/preview error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Operator preview failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /command/execute
// ─────────────────────────────────────────────────────────────────────────────

router.post("/command/execute", async (req, res) => {
  try {
    const validation = validateCommandInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        ok: false,
        errors: validation.errors,
        hint: "Provide: { commandType, intent, payload, requestedBy, approval? }",
      });
    }

    const result = await operatorService.executeCommand(req.body);
    return res.json(result);
  } catch (err) {
    console.error("[operator-bridge] /command/execute error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Operator execute failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /audit
// ─────────────────────────────────────────────────────────────────────────────

router.get("/audit", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const entries = await operatorService.getAuditLog(limit);
    return res.json({
      ok: true,
      count: entries.length,
      limit,
      entries,
    });
  } catch (err) {
    console.error("[operator-bridge] /audit error:", err && err.stack ? err.stack : err);
    return res.status(500).json({
      ok: false,
      error: "Audit log read failed.",
      detail: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
