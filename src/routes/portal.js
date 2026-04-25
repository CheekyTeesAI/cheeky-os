"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");

router.get("/api/portal/:token", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const order = await prisma.order.findFirst({
      where: {
        portalToken: String(req.params.token || ""),
        portalEnabled: true,
      },
      include: {
        lineItems: true,
        artFiles: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Portal link not found",
        code: "PORTAL_NOT_FOUND",
      });
    }

    const paymentLink = order.squareInvoiceId
      ? `https://squareup.com/pay-invoice/${order.squareInvoiceId}`
      : null;

    return res.json({
      success: true,
      data: {
        id: order.id,
        customerName: order.customerName,
        status: order.status,
        nextAction: order.nextAction,
        notes: order.notes || "",
        paymentLink,
        items: order.lineItems || [],
        artFiles: order.artFiles || [],
      },
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "portal_fetch_failed",
      code: "PORTAL_FETCH_FAILED",
    });
  }
});

router.post("/api/portal/:token/art/:artId/approve", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const order = await prisma.order.findFirst({
      where: {
        portalToken: String(req.params.token || ""),
        portalEnabled: true,
      },
      select: { id: true },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Portal link not found",
        code: "PORTAL_NOT_FOUND",
      });
    }

    const art = await prisma.artFile.findFirst({
      where: { id: String(req.params.artId || ""), orderId: order.id },
    });

    if (!art) {
      return res.status(404).json({
        success: false,
        error: "Art file not found",
        code: "ART_NOT_FOUND",
      });
    }

    const updated = await prisma.artFile.update({
      where: { id: art.id },
      data: { approvalStatus: "APPROVED" },
    });

    return res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "art_approval_failed",
      code: "ART_APPROVAL_FAILED",
    });
  }
});

module.exports = router;
