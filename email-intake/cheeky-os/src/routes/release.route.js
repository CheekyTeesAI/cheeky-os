"use strict";

const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const evaluateTaskReleaseAction = require("../actions/evaluateTaskReleaseAction");
const markBlanksOrderedAction = require("../actions/markBlanksOrderedAction");

router.get("/api/operator/release", async (_req, res) => {
  try {
    if (!prisma) {
      return res.json({
        success: false,
        error: "Prisma unavailable",
        tasks: [],
      });
    }

    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return res.json({
      success: true,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        releaseStatus: t.releaseStatus,
        orderReady: t.orderReady,
        blanksOrdered: t.blanksOrdered,
        productionHold: t.productionHold,
        eligibleForVendorDraft:
          t.releaseStatus === "READY" && t.orderReady === true && t.blanksOrdered !== true,
      })),
    });
  } catch (err) {
    return res.json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

router.post("/api/operator/release/:id/evaluate", async (req, res) => {
  try {
    const result = await evaluateTaskReleaseAction(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

router.post("/api/operator/release/:id/mark-blanks-ordered", async (req, res) => {
  try {
    const result = await markBlanksOrderedAction(req.params.id);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
