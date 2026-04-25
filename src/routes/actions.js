"use strict";

const express = require("express");
const router = express.Router();

const { getPrisma } = require("../services/decisionEngine");
const { createQuote } = require("../services/quoteService");
const { createDepositFromQuote } = require("../services/depositService");
const { createProductionJob } = require("../services/productionService");
const { createGarmentOrder } = require("../services/garmentService");
const { createReorderFromOrder } = require("../services/reorderService");

async function resolveQuoteId(inputId) {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");
  const id = String(inputId || "");
  if (!id) throw new Error("ID_REQUIRED");

  const direct = await prisma.quote.findUnique({
    where: { id },
    select: { id: true },
  });
  if (direct) return direct.id;

  const latestForOrder = await prisma.quote.findFirst({
    where: { orderId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!latestForOrder) throw new Error("QUOTE_NOT_FOUND");
  return latestForOrder.id;
}

router.post("/api/actions/run", async (req, res) => {
  try {
    const { action, id } = req.body || {};
    let result = null;

    if (action === "CREATE_QUOTE") {
      result = await createQuote(id);
    } else if (action === "CREATE_DEPOSIT") {
      const quoteId = await resolveQuoteId(id);
      result = await createDepositFromQuote(quoteId);
    } else if (action === "CREATE_JOB") {
      result = await createProductionJob(id);
    } else if (action === "ORDER_GARMENTS") {
      result = await createGarmentOrder(id);
    } else if (action === "ADVANCE_JOB") {
      const prisma = getPrisma();
      if (!prisma) throw new Error("DB_UNAVAILABLE");
      const job = await prisma.productionJob.findUnique({ where: { id: String(id || "") } });
      if (!job) throw new Error("JOB_NOT_FOUND");
      const cur = String(job.status || "READY").toUpperCase();
      let next = "READY";
      if (cur === "READY") next = "PRINTING";
      else if (cur === "PRINTING") next = "QC";
      else if (cur === "QC") next = "COMPLETE";
      else next = cur;
      result = await prisma.productionJob.update({
        where: { id: job.id },
        data: { status: next },
      });
    } else if (action === "REORDER") {
      result = await createReorderFromOrder(id);
    } else {
      throw new Error("UNKNOWN_ACTION");
    }

    return res.json({
      success: true,
      action,
      data: result,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "action_failed",
      action: req.body && req.body.action,
    });
  }
});

module.exports = router;
