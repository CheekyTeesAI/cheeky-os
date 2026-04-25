"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { createQuote } = require("../services/quoteService");
const { createDepositFromQuote } = require("../services/depositService");

router.post("/api/quotes/:orderId/create", async (req, res) => {
  try {
    const quote = await createQuote(req.params.orderId);
    return res.json({
      success: true,
      data: quote,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "quote_create_failed",
      code: "QUOTE_CREATE_FAILED",
    });
  }
});

router.post("/api/quotes/:id/accept", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable" });
    }

    const quote = await prisma.quote.update({
      where: { id: String(req.params.id || "") },
      data: { status: "ACCEPTED" },
    });

    let deposit = null;
    try {
      deposit = await createDepositFromQuote(quote.id);
    } catch (squareError) {
      console.log(
        "[DEPOSIT ENGINE SKIPPED]",
        squareError && squareError.message ? squareError.message : squareError
      );
    }

    await prisma.order.update({
      where: { id: quote.orderId },
      data: {
        status: deposit ? "DEPOSIT_PENDING" : "QUOTE_ACCEPTED",
        nextAction: deposit ? "Collect deposit" : "Create deposit invoice",
        nextOwner: "Cheeky",
        blockedReason: deposit ? "WAITING_ON_DEPOSIT" : "INVOICE_NOT_CREATED",
      },
    });

    return res.json({
      success: true,
      data: {
        quote,
        depositCreated: !!deposit,
        paymentLink:
          deposit && deposit.invoice && deposit.invoice.paymentLink
            ? deposit.invoice.paymentLink
            : null,
      },
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "quote_accept_failed",
      code: "QUOTE_ACCEPT_FAILED",
    });
  }
});

router.get("/api/quotes", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable" });
    }

    const list = await prisma.quote.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return res.json({
      success: true,
      data: list,
    });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "quotes_failed" });
  }
});

module.exports = router;
