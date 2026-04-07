/**
 * Bundle 12 — POST /orders/add-note, POST /orders/add-decision
 */

const express = require("express");
const { getPrisma } = require("../marketing/prisma-client");
const {
  addNote,
  addDecision,
  memoryInnerToJson,
} = require("../services/orderMemoryService");

const router = express.Router();

router.post("/add-note", async (req, res) => {
  try {
    const body = req.body || {};
    const orderId = String(body.orderId != null ? body.orderId : "").trim();
    const text = String(body.text != null ? body.text : "").trim();
    const sourceRaw = body.source;
    const source = sourceRaw === "system" ? "system" : "founder";

    if (!orderId || !text) {
      return res.json({
        success: false,
        error: "orderId and text are required",
      });
    }

    const prisma = getPrisma();
    if (!prisma || !prisma.captureOrder) {
      return res.json({
        success: false,
        error: "Database not available",
      });
    }

    const order = await prisma.captureOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.json({ success: false, error: "order not found" });
    }

    const { noteAdded, innerForStore } = addNote(order, text, source);
    if (!noteAdded) {
      return res.json({ success: false, error: "Invalid note" });
    }

    await prisma.captureOrder.update({
      where: { id: orderId },
      data: { memoryJson: memoryInnerToJson(innerForStore) },
    });

    return res.json({
      success: true,
      orderId,
      noteAdded: {
        text: noteAdded.text,
        source: noteAdded.source,
        createdAt: noteAdded.createdAt,
      },
    });
  } catch (err) {
    console.error("[orders/add-note]", err.message || err);
    return res.json({ success: false, error: "failed" });
  }
});

router.post("/add-decision", async (req, res) => {
  try {
    const body = req.body || {};
    const orderId = String(body.orderId != null ? body.orderId : "").trim();
    const text = String(body.text != null ? body.text : "").trim();
    const sourceRaw = body.source;
    const source = sourceRaw === "system" ? "system" : "founder";

    if (!orderId || !text) {
      return res.json({
        success: false,
        error: "orderId and text are required",
      });
    }

    const prisma = getPrisma();
    if (!prisma || !prisma.captureOrder) {
      return res.json({
        success: false,
        error: "Database not available",
      });
    }

    const order = await prisma.captureOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.json({ success: false, error: "order not found" });
    }

    const { decisionAdded, innerForStore } = addDecision(order, text, source);
    if (!decisionAdded) {
      return res.json({ success: false, error: "Invalid decision" });
    }

    await prisma.captureOrder.update({
      where: { id: orderId },
      data: { memoryJson: memoryInnerToJson(innerForStore) },
    });

    return res.json({
      success: true,
      orderId,
      decisionAdded: {
        text: decisionAdded.text,
        source: decisionAdded.source,
        createdAt: decisionAdded.createdAt,
      },
    });
  } catch (err) {
    console.error("[orders/add-decision]", err.message || err);
    return res.json({ success: false, error: "failed" });
  }
});

module.exports = router;
