/**
 * Bundle 13 — GET /orders/intelligence/:orderId
 */

const express = require("express");
const { getPrisma } = require("../marketing/prisma-client");
const { getMemory } = require("../services/orderMemoryService");
const { analyzeJob, inferProductType } = require("../services/jobIntelligenceService");

const router = express.Router();

function emptyIntelligence() {
  return {
    risk: { level: "low", flags: [] },
    upsell: { suggestion: "", reason: "", confidence: "low" },
    pricing: { flag: "", reason: "" },
    recommendation: "",
  };
}

router.get("/intelligence/:orderId", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.json({
        orderId: "",
        customerName: "",
        intelligence: emptyIntelligence(),
      });
    }

    const prisma = getPrisma();
    if (!prisma || !prisma.captureOrder) {
      return res.json({
        orderId,
        customerName: "",
        intelligence: emptyIntelligence(),
      });
    }

    const order = await prisma.captureOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      return res.json({
        orderId,
        customerName: "",
        intelligence: emptyIntelligence(),
      });
    }

    const mem = getMemory(order);
    const intelligence = analyzeJob({
      customerName: order.customerName,
      quantity: order.quantity,
      productType: inferProductType("", order.product),
      product: order.product,
      printType: order.printType,
      dueText: order.dueDate || "",
      status: order.status,
      paymentStatus: order.paymentStatus || "",
      memory: {
        notes: mem.notes,
        decisions: mem.decisions,
        flags: mem.flags,
        history: mem.history,
      },
      rawText: String(order.paymentNotes || ""),
    });

    return res.json({
      orderId,
      customerName: order.customerName || "",
      intelligence,
    });
  } catch (err) {
    console.error("[orders/intelligence]", err.message || err);
    return res.json({
      orderId: String(req.params.orderId || ""),
      customerName: "",
      intelligence: emptyIntelligence(),
    });
  }
});

module.exports = router;
