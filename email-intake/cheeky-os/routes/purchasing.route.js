"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();
router.use(express.json({ limit: "128kb" }));

const store = require(path.join(__dirname, "..", "services", "purchasing.store"));
const engine = require(path.join(__dirname, "..", "services", "purchasingEngine.service"));

router.get("/plans", (_req, res) => {
  try {
    const plans = store.listPlans();
    const metrics = store.metrics();
    return res.status(200).json({
      ok: true,
      plans,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      plans: [],
      metrics: store.metrics(),
      error: e instanceof Error ? e.message : String(e),
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/orders/:orderId/plan", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const force = !!body.force;
    const out = await engine.buildPurchasePlanForOrder(orderId, { force });
    if (!out.ok) return res.status(200).json({ ok: false, error: out.error });
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

function loadPlan(id) {
  return store.findPlanById(id);
}

router.patch("/plans/:id/approve", (req, res) => {
  try {
    const plan = loadPlan(req.params.id);
    if (!plan) return res.status(200).json({ ok: false, error: "not_found" });
    const st = String(plan.status || "").toUpperCase();
    if (st === "BLOCKED") return res.status(200).json({ ok: false, error: "cannot_approve_blocked", plan });
    if (st === "CANCELED") return res.status(200).json({ ok: false, error: "canceled", plan });
    if (!["DRAFT", "NEEDS_APPROVAL"].includes(st)) {
      return res.status(200).json({ ok: false, error: "invalid_status_for_approve", plan });
    }
    const now = new Date().toISOString();
    const updated = {
      ...plan,
      status: "APPROVED",
      approvedAt: now,
      updatedAt: now,
      notes: [plan.notes, "approved"].filter(Boolean).join(" | ").slice(0, 4000),
    };
    store.savePlan(updated);
    console.log(`[purchasing] PLAN APPROVED planId=${plan.id} orderId=${plan.orderId}`);
    return res.status(200).json({ ok: true, plan: updated });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.patch("/plans/:id/ordered", (req, res) => {
  try {
    const plan = loadPlan(req.params.id);
    if (!plan) return res.status(200).json({ ok: false, error: "not_found" });
    const st = String(plan.status || "").toUpperCase();
    if (st !== "APPROVED") return res.status(200).json({ ok: false, error: "must_be_approved_first", plan });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const vendorOrderNumber = body.vendorOrderNumber != null ? String(body.vendorOrderNumber).slice(0, 200) : "";
    const note = body.note != null ? String(body.note).slice(0, 2000) : "";
    const now = new Date().toISOString();
    const updated = {
      ...plan,
      status: "ORDERED",
      orderedAt: now,
      vendorOrderNumber: vendorOrderNumber || plan.vendorOrderNumber || null,
      updatedAt: now,
      notes: [plan.notes, note ? `ordered: ${note}` : "marked ordered", vendorOrderNumber ? `#${vendorOrderNumber}` : ""]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 4000),
    };
    store.savePlan(updated);
    console.log(`[purchasing] PLAN ORDERED planId=${plan.id}`);
    return res.status(200).json({ ok: true, plan: updated });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.patch("/plans/:id/receive", (req, res) => {
  try {
    const plan = loadPlan(req.params.id);
    if (!plan) return res.status(200).json({ ok: false, error: "not_found" });
    const st = String(plan.status || "").toUpperCase();
    if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(st)) {
      return res.status(200).json({ ok: false, error: "must_be_ordered_first", plan });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const note = body.note != null ? String(body.note).slice(0, 2000) : "";
    const receivedItems = Array.isArray(body.receivedItems) ? body.receivedItems : [];
    const now = new Date().toISOString();
    const partial = receivedItems.length > 0 && receivedItems.length < (plan.items || []).length;
    const updated = {
      ...plan,
      status: partial ? "PARTIALLY_RECEIVED" : "RECEIVED",
      receivedAt: partial ? plan.receivedAt || null : now,
      updatedAt: now,
      notes: [plan.notes, note ? `receive: ${note}` : "marked received", JSON.stringify(receivedItems).slice(0, 500)]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 4000),
    };
    if (!partial) updated.receivedAt = now;
    store.savePlan(updated);
    console.log(`[purchasing] PLAN RECEIVE planId=${plan.id} partial=${partial}`);
    return res.status(200).json({ ok: true, plan: updated });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

router.patch("/plans/:id/cancel", (req, res) => {
  try {
    const plan = loadPlan(req.params.id);
    if (!plan) return res.status(200).json({ ok: false, error: "not_found" });
    const st = String(plan.status || "").toUpperCase();
    if (["RECEIVED", "CANCELED"].includes(st)) {
      return res.status(200).json({ ok: false, error: "cannot_cancel", plan });
    }
    const now = new Date().toISOString();
    const updated = {
      ...plan,
      status: "CANCELED",
      updatedAt: now,
      notes: [plan.notes, "canceled"].filter(Boolean).join(" | ").slice(0, 4000),
    };
    store.savePlan(updated);
    console.log(`[purchasing] PLAN CANCELED planId=${plan.id}`);
    return res.status(200).json({ ok: true, plan: updated });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

module.exports = router;
