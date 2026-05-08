"use strict";

const express = require("express");
const path = require("path");

const router = express.Router();
const engine = require(path.join(__dirname, "..", "services", "fulfillmentEngine.service"));

router.get("/queue", async (_req, res) => {
  try {
    const payload = await engine.buildFulfillmentQueuePayload();
    return res.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(200).json({
      ok: false,
      error: msg,
      pickupReady: [],
      shippingStaged: [],
      needsReview: [],
      completed: [],
      metrics: { pickupReady: 0, shippingStaged: 0, needsReview: 0, completed: 0 },
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/:orderId/pirate-ship/draft", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(200).json({ ok: false, error: "orderId_required" });
    }
    const shipmentDraft = engine.buildPirateShipShipmentDraft(orderId);
    return res.status(200).json({
      ok: true,
      mode: "local_draft",
      shipmentDraft,
      message: "Copy this into Pirate Ship",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(200).json({ ok: false, error: msg });
  }
});

/** Draft-only comms row (idempotent); never sends. */
router.post("/:orderId/customer-draft", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) return res.status(200).json({ ok: false, error: "orderId_required" });
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const type = String(body.messageType || "READY_FOR_PICKUP").trim();
    const draft = require(path.join(__dirname, "..", "services", "customerMessageDraft.service"));
    const r = await draft.createCustomerMessageDraft(orderId, type, "email");
    if (r && r.ok) {
      console.log(`[fulfillment] CUSTOMER DRAFT CREATED orderId=${orderId} type=${type}`);
    }
    return res.status(200).json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(200).json({ ok: false, error: msg });
  }
});

module.exports = router;
