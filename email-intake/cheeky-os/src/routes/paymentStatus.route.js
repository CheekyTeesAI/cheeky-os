"use strict";

const express = require("express");
const router = express.Router();
const prisma = require("../prisma");

router.get("/api/operator/payment-status", async (_req, res) => {
  try {
    if (!prisma) {
      return res.json({
        success: false,
        error: "Prisma unavailable",
        leads: [],
      });
    }

    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return res.json({
      success: true,
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        quoteAmount: l.quoteAmount,
        depositAmount: l.depositAmount,
        depositPaid: l.depositPaid,
        paymentStatus: l.paymentStatus,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    return res.json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
