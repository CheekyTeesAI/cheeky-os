"use strict";

const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const markDepositPaidAction = require("../actions/markDepositPaidAction");

router.get("/api/operator/payments", async (_req, res) => {
  try {
    if (!prisma) {
      return res.json({
        success: false,
        error: "Prisma unavailable",
        leadsNeedingDeposit: [],
      });
    }

    const leadsNeedingDeposit = await prisma.lead.findMany({
      where: {
        depositRequired: true,
        depositPaid: false,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return res.json({
      success: true,
      leadsNeedingDeposit,
    });
  } catch (err) {
    return res.json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

router.post("/api/operator/payments/:id/mark-paid", async (req, res) => {
  try {
    const result = await markDepositPaidAction(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
