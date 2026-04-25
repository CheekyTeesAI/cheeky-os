/**
 * Customer communication loop — loads dist customerCommsService.
 */

const express = require("express");
const path = require("path");

const router = express.Router();

const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

function loadComms() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "customerCommsService.js"
    ));
  } catch {
    return null;
  }
}

function loadCustomerReplyService() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "customerReplyService.js"
    ));
  } catch {
    return null;
  }
}

function jsonErr(res, status, msg) {
  return res.status(status).json({ success: false, error: msg });
}

router.get("/replies", async (_req, res) => {
  const mod = loadCustomerReplyService();
  if (!mod || typeof mod.listRecentInboundReplies !== "function") {
    return res.status(503).json({
      success: false,
      error:
        "Customer reply module unavailable — run `npm run build` in email-intake",
      count: 0,
      items: [],
    });
  }
  try {
    const rows = await mod.listRecentInboundReplies(80);
    const items = (rows || []).map((r) => ({
      orderId: r.orderId,
      customerEmail: r.customerEmail,
      classification: r.classification,
      needsReview: !!r.needsReview,
      excerpt:
        typeof r.message === "string" && r.message.length > 500
          ? `${r.message.slice(0, 500)}…`
          : r.message,
      type: r.type,
      matchConfidence: r.matchConfidence,
      subject: r.subject,
      createdAt: r.createdAt,
    }));
    return res.json({ success: true, count: items.length, items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res
      .status(500)
      .json({ success: false, error: msg, count: 0, items: [] });
  }
});

router.get("/recent", async (_req, res) => {
  const mod = loadComms();
  if (!mod || typeof mod.listRecentCommunications !== "function") {
    return res.status(503).json({
      success: false,
      error: "Comms module unavailable — run `npm run build` in email-intake",
      entries: [],
    });
  }
  try {
    const entries = await mod.listRecentCommunications(50);
    return res.json({ success: true, entries });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg, entries: [] });
  }
});

router.get("/deposits-needed", async (_req, res) => {
  const mod = loadComms();
  if (!mod || typeof mod.getOrdersNeedingDepositReminder !== "function") {
    return res.status(503).json({
      success: false,
      error: "Comms module unavailable",
      orders: [],
    });
  }
  try {
    const orders = await mod.getOrdersNeedingDepositReminder();
    return res.json({ success: true, orders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg, orders: [] });
  }
});

router.get("/ready-for-pickup", async (_req, res) => {
  const mod = loadComms();
  if (!mod || typeof mod.getOrdersReadyForPickup !== "function") {
    return res.status(503).json({
      success: false,
      error: "Comms module unavailable",
      orders: [],
    });
  }
  try {
    const orders = await mod.getOrdersReadyForPickup();
    return res.json({ success: true, orders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg, orders: [] });
  }
});

router.post("/send-deposit-reminder", async (req, res) => {
  const mod = loadComms();
  if (!mod || typeof mod.sendDepositReminder !== "function") {
    return res.status(503).json({
      success: false,
      error: "Comms module unavailable — run `npm run build`",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) return jsonErr(res, 400, "orderId required");
  try {
    const out = await mod.sendDepositReminder(orderId);
    try {
      memoryService.logEvent("deposit_reminder_sent", { orderId });
    } catch (_) {}
    return res.json({
      success: true,
      action: out.action,
      deliveryMode: out.deliveryMode,
      orderId: out.orderId,
      logId: out.logId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) return jsonErr(res, 404, msg);
    return jsonErr(res, 400, msg);
  }
});

router.post("/send-proof-request", async (req, res) => {
  const mod = loadComms();
  if (!mod || typeof mod.sendProofRequestComm !== "function") {
    return res.status(503).json({
      success: false,
      error: "Comms module unavailable — run `npm run build`",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) return jsonErr(res, 400, "orderId required");
  try {
    const out = await mod.sendProofRequestComm(orderId);
    try {
      memoryService.logEvent("proof_request_sent", { orderId });
    } catch (_) {}
    return res.json({
      success: true,
      action: out.action,
      deliveryMode: out.deliveryMode,
      orderId: out.orderId,
      logId: out.logId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) return jsonErr(res, 404, msg);
    return jsonErr(res, 400, msg);
  }
});

router.post("/send-status-update", async (req, res) => {
  const mod = loadComms();
  if (!mod || typeof mod.sendStatusUpdate !== "function") {
    return res.status(503).json({
      success: false,
      error: "Comms module unavailable — run `npm run build`",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  const message =
    req.body && typeof req.body.message === "string" ? req.body.message : "";
  if (!orderId) return jsonErr(res, 400, "orderId required");
  try {
    const out = await mod.sendStatusUpdate(orderId, message);
    try {
      memoryService.logEvent("status_update_sent", { orderId });
    } catch (_) {}
    return res.json({
      success: true,
      action: out.action,
      deliveryMode: out.deliveryMode,
      orderId: out.orderId,
      logId: out.logId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) return jsonErr(res, 404, msg);
    return jsonErr(res, 400, msg);
  }
});

router.post("/send-pickup-ready", async (req, res) => {
  const mod = loadComms();
  if (!mod || typeof mod.sendPickupReady !== "function") {
    return res.status(503).json({
      success: false,
      error: "Comms module unavailable — run `npm run build`",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) return jsonErr(res, 400, "orderId required");
  try {
    const out = await mod.sendPickupReady(orderId);
    try {
      memoryService.logEvent("pickup_ready_sent", { orderId });
    } catch (_) {}
    return res.json({
      success: true,
      action: out.action,
      deliveryMode: out.deliveryMode,
      orderId: out.orderId,
      logId: out.logId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) return jsonErr(res, 404, msg);
    return jsonErr(res, 400, msg);
  }
});

module.exports = router;
