"use strict";

const path = require("path");
const express = require("express");

const safety = require("../agent/safetyGuard");
const { validateMinimalDraft } = require("../workorders/workOrderBuilder");
const workOrderStore = require("../workorders/workOrderStore");
const workflowRules = require("../workflow/orderWorkflowRules");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

const router = express.Router();

router.post("/api/workorders/create-draft", express.json({ limit: "512kb" }), (req, res) => {
  try {
    safety.auditLog({
      eventType: "workorder_draft_v8",
      taskId: null,
      actor: req.body?.requestedBy || "http",
      metadata: { approvalRequired: true, autoFinalize: false },
    });

    const { ok, draft, missing } = validateMinimalDraft(req.body || {});
    if (!ok) {
      return res.status(400).json({ success: false, error: "validation_failed", missing, draftPreview: draft });
    }
    workOrderStore.append(draft);
    return res.json({
      success: true,
      data: draft,
      message: "Draft saved locally — approvals required before any customer-facing finalize.",
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/workorders/production-ready", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma || !prisma.order) {
      return res.status(503).json({ success: false, error: "prisma_unavailable" });
    }
    const rows = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: "PRODUCTION_READY",
      },
      orderBy: { updatedAt: "asc" },
      take: 80,
      include: {
        lineItems: { take: 8, select: { description: true, quantity: true } },
      },
    });
    const slim = rows.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      orderNumber: o.orderNumber,
      status: o.status,
      gates: workflowRules.productionGateSnapshot(o),
      lineItemsSummary: (o.lineItems || []).map((i) => i.description).filter(Boolean).join("; ").slice(0, 200),
      dueHint: o.quoteExpiresAt || null,
    }));
    return res.json({ success: true, generatedAt: new Date().toISOString(), orders: slim });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

router.get("/api/workorders/:id", (req, res) => {
  try {
    const row = workOrderStore.getById(req.params.id);
    if (!row) return res.status(404).json({ success: false, error: "not_found" });
    return res.json({ success: true, data: row });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

module.exports = router;
