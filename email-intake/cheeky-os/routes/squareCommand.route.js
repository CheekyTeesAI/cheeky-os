"use strict";

const express = require("express");
const path = require("path");
const draftsStore = require("../services/squareActionDrafts.store");
const sqCmd = require("../services/squareCommand.service");

const router = express.Router();
router.use(express.json({ limit: "256kb" }));

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

/** Resolve Square customer id from order if possible */
async function enrichCustomerId(body) {
  let customerId = body.customerId != null ? String(body.customerId).trim() : "";
  const orderId = body.orderId != null ? String(body.orderId).trim() : "";
  if (customerId || !orderId) return customerId || null;
  const prisma = getPrisma();
  if (!prisma) return null;
  try {
    const o = await prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { squareCustomerId: true, customerEmail: true },
    });
    if (o && o.squareCustomerId) return String(o.squareCustomerId).trim();
  } catch (_e) {}
  return null;
}

router.get("/drafts", (_req, res) => {
  try {
    const { entries } = draftsStore.listAll();
    return res.status(200).json({ ok: true, drafts: entries.slice().reverse(), count: entries.length });
  } catch (e) {
    return res.status(200).json({ ok: true, drafts: [], count: 0, warning: String(e && e.message ? e.message : e) });
  }
});

router.post("/drafts", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const type = draftsStore.normalizeType(body.type);
    if (!type) {
      return res.status(400).json({ ok: false, error: "type must be ESTIMATE | INVOICE | DEPOSIT_REQUEST | BALANCE_DUE" });
    }
    const customerFromOrder = await enrichCustomerId(body);
    const payload = {
      orderId: body.orderId,
      customerId: body.customerId || customerFromOrder,
      type,
      amount: body.amount,
      depositAmount: body.depositAmount,
      lineItems: Array.isArray(body.lineItems) ? body.lineItems : [],
      notes: body.notes,
    };
    const out = draftsStore.upsertDraft(payload);
    return res.status(200).json({
      ok: true,
      draft: out.draft,
      created: out.created,
      idempotent: !!out.idempotent,
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

router.patch("/drafts/:id/approve", (req, res) => {
  try {
    const d = draftsStore.getById(req.params.id);
    if (!d) return res.status(404).json({ ok: false, error: "not_found" });
    const st = String(d.status || "").toUpperCase();
    if (st !== "DRAFT") {
      return res.status(200).json({ ok: false, error: "only_DRAFT_can_be_approved", currentStatus: d.status });
    }
    const updated = draftsStore.setStatus(d.id, "APPROVED");
    return res.status(200).json({ ok: true, draft: updated });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/drafts/:id/create-square-draft", async (req, res) => {
  try {
    const d = draftsStore.getById(req.params.id);
    if (!d) return res.status(404).json({ ok: false, error: "not_found" });
    if (String(d.status || "").toUpperCase() !== "APPROVED") {
      return res.status(200).json({
        ok: false,
        error: "must_be_APPROVED",
        hint: "PATCH /api/square/drafts/:id/approve first",
      });
    }

    let working = { ...d };
    if (!working.customerId && working.orderId) {
      const c = await enrichCustomerId({ orderId: working.orderId, customerId: null });
      if (c) working.customerId = c;
    }

    const result = await sqCmd.createSquareDraftFromApproved(working);
    if (!result.ok) {
      draftsStore.setError(d.id, result.error || "square_failed");
      return res.status(200).json({
        ok: false,
        error: result.error || "square_failed",
        draft: draftsStore.getById(d.id),
      });
    }

    const updated = draftsStore.setSquareDraftId(d.id, result.squareDraftId || "", {
      localEstimateId: result.localEstimateId || undefined,
      squareOrderId: result.squareOrderId,
      notesAppend:
        result.mode ? `[${result.mode}]` + (result.localEstimateId ? ` estimateId=${result.localEstimateId}` : "") : "",
    });
    return res.status(200).json({
      ok: true,
      draft: updated,
      square: {
        invoiceOrDraftId: result.squareDraftId || null,
        localEstimateId: result.localEstimateId || null,
        mode: result.mode || null,
      },
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/order/:orderId/status", async (req, res) => {
  try {
    const out = await sqCmd.getOrderFinancialStatus(req.params.orderId);
    return res.status(200).json(out);
  } catch (e) {
    return res.status(200).json({
      ok: true,
      orderId: String(req.params.orderId || ""),
      squareInvoiceId: null,
      squareOrderId: null,
      amountPaid: 0,
      depositPaidAt: null,
      balanceDue: 0,
      status: null,
      warnings: [e instanceof Error ? e.message : String(e)],
    });
  }
});

module.exports = router;
