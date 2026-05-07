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
const revenueRecovery = require(path.join(__dirname, "..", "services", "revenueRecoveryEngine.service"));
const customerCommsSend = require(path.join(__dirname, "..", "services", "customerCommsQueueSend.service"));

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function normCommsStatus(s) {
  const u = String(s || "").toUpperCase();
  if (u === "PENDING") return "DRAFT";
  return u || "DRAFT";
}

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

/** Revenue recovery + customer comms queue (additive; no auto-send). */
router.get("/queue", async (_req, res) => {
  let recovery = { success: true, count: 0, updatedAt: null, items: [] };
  try {
    const store = revenueRecovery.readRecoveryStore();
    recovery = {
      success: true,
      count: (store.items && store.items.length) || 0,
      updatedAt: store.updatedAt,
      items: store.items || [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recovery = { success: false, count: 0, updatedAt: null, items: [], error: msg };
  }

  const prisma = getPrisma();
  /** @type {object[]} */
  let allComms = [];
  /** @type {object[]} */
  let needsApproval = [];
  /** @type {object[]} */
  let readyToSend = [];
  /** @type {object[]} */
  let sent = [];
  /** @type {object[]} */
  let errors = [];

  if (!prisma || !prisma.communicationApproval) {
    return res.json({
      success: recovery.success,
      count: recovery.count,
      updatedAt: recovery.updatedAt,
      items: recovery.items,
      ok: true,
      drafts: [],
      needsApproval: [],
      readyToSend: [],
      sent: [],
      errors: [],
      recovery,
      warning: "customer_comms_prisma_unavailable",
    });
  }

  try {
    const rows = await prisma.communicationApproval.findMany({
      where: { NOT: { status: "CANCELED" } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const orderIds = [...new Set(rows.map((r) => r.orderId).filter(Boolean))];
    const orders = orderIds.length
      ? await prisma.order.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, customerName: true, email: true, phone: true },
        })
      : [];
    const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]));

    for (const r of rows) {
      const o = r.orderId ? orderMap[r.orderId] : null;
      const st = normCommsStatus(r.status);
      const mapped = {
        id: r.id,
        orderId: r.orderId,
        customerName: o ? o.customerName : null,
        customerEmail: o ? o.email : null,
        customerPhone: o ? o.phone : null,
        type: r.messageType || "GENERAL_UPDATE",
        channel: r.channel,
        status: st,
        subject: r.subject,
        body: r.textBody,
        bodyPreview:
          typeof r.textBody === "string" && r.textBody.length > 320
            ? `${r.textBody.slice(0, 320)}…`
            : r.textBody || "",
        requiresApproval: st === "DRAFT",
        approvedAt: r.approvedAt,
        sentAt: st === "SENT" ? r.updatedAt : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
      allComms.push(mapped);
      if (st === "DRAFT") needsApproval.push(mapped);
      else if (st === "APPROVED") readyToSend.push(mapped);
      else if (st === "SENT") sent.push(mapped);
      else if (st === "ERROR") errors.push(mapped);
    }
  } catch (ce) {
    const msg = ce instanceof Error ? ce.message : String(ce);
    return res.status(500).json({
      success: false,
      ok: false,
      error: msg,
      items: recovery.items,
      drafts: [],
      needsApproval: [],
      readyToSend: [],
      sent: [],
      errors: [],
      recovery,
    });
  }

  return res.json({
    success: recovery.success,
    count: recovery.count,
    updatedAt: recovery.updatedAt,
    items: recovery.items,
    ok: true,
    drafts: allComms,
    needsApproval,
    readyToSend,
    sent,
    errors,
    recovery,
  });
});

router.patch("/:id/approve", async (req, res) => {
  const id = String((req.params && req.params.id) || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  const prisma = getPrisma();
  if (!prisma) return res.status(503).json({ ok: false, error: "database_unavailable" });
  try {
    const row = await prisma.communicationApproval.findFirst({ where: { id } });
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    const st = normCommsStatus(row.status);
    if (st === "SENT") return res.status(400).json({ ok: false, error: "already_sent" });
    if (st === "CANCELED") return res.status(400).json({ ok: false, error: "canceled" });
    const updated = await prisma.communicationApproval.update({
      where: { id },
      data: { status: "APPROVED", approvedAt: new Date() },
    });
    return res.json({ ok: true, comm: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

router.patch("/:id/cancel", async (req, res) => {
  const id = String((req.params && req.params.id) || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  const prisma = getPrisma();
  if (!prisma) return res.status(503).json({ ok: false, error: "database_unavailable" });
  try {
    const row = await prisma.communicationApproval.findFirst({ where: { id } });
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    const st = normCommsStatus(row.status);
    if (st === "SENT") return res.status(400).json({ ok: false, error: "already_sent" });
    const updated = await prisma.communicationApproval.update({
      where: { id },
      data: { status: "CANCELED" },
    });
    return res.json({ ok: true, comm: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

router.post("/:id/send", async (req, res) => {
  const id = String((req.params && req.params.id) || "").trim();
  if (!id) return res.status(400).json({ ok: false, error: "id required" });
  const prisma = getPrisma();
  if (!prisma) return res.status(503).json({ ok: false, error: "database_unavailable" });
  try {
    const row = await prisma.communicationApproval.findFirst({ where: { id } });
    if (!row) return res.status(404).json({ ok: false, error: "not_found" });
    const st = normCommsStatus(row.status);
    if (st !== "APPROVED") {
      return res.status(400).json({ ok: false, error: "must_be_approved" });
    }
    const sendOut = await customerCommsSend.sendApprovedQueueEmail(row);
    if (!sendOut.ok) {
      await prisma.communicationApproval.update({
        where: { id },
        data: {
          status: "ERROR",
          sendResult: String(sendOut.error || "send_failed").slice(0, 500),
        },
      });
      return res.status(400).json({ ok: false, error: sendOut.error || "send_failed" });
    }
    const updated = await prisma.communicationApproval.update({
      where: { id },
      data: {
        status: "SENT",
        sendResult: `sent:${sendOut.messageId || ""}`,
      },
    });
    return res.json({ ok: true, comm: updated, messageId: sendOut.messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * Approve / reset draft queue rows. Outbound send must only run for APPROVED rows
 * (integrate with your existing send path — never auto-send from this engine).
 */
router.patch("/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return jsonErr(res, 400, "id required");
    const status =
      req.body && req.body.status != null ? String(req.body.status).trim().toUpperCase() : "";
    const out = revenueRecovery.patchRecoveryQueueItem(id, { status });
    if (!out.ok) {
      if (out.error === "not_found") return jsonErr(res, 404, "queue item not found");
      return jsonErr(res, 400, "status must be DRAFT | APPROVED | SENT");
    }
    return res.json({ success: true, item: out.item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonErr(res, 500, msg);
  }
});

module.exports = router;
