"use strict";

const fs = require("fs");
const { Router } = require("express");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const salesOpsOutputs = require("../helpers/salesOpsOutputs");
const { getFounderRevenueScore } = require("../actions/revenue/getFounderRevenueScore");
const { getNextBestCashActions } = require("../actions/revenue/getNextBestCashActions");

const router = Router();

function computeReadyState(queue, totalItems, latestProcessed) {
  const pendingReview = Number(queue.pending) || 0;
  const pendingFollowup = Number(queue.pending_followup) || 0;
  const approved = Number(queue.approved) || 0;
  const failed = Number(queue.failed) || 0;

  if (approved > 0) return "READY_TO_SEND";
  if (pendingFollowup > 0) return "FOLLOWUP_NEEDED";
  if (failed > 0) return "ATTENTION_REQUIRED";
  if (pendingReview > 0) return "REVIEW";
  if (totalItems === 0 && (!latestProcessed || latestProcessed === 0)) {
    return "NO_LEADS";
  }
  return "STABLE";
}

router.get("/ops/status", (_req, res) => {
  try {
    const queue = approvalQueue.getQueueCounts();
    const totalItems = approvalQueue.totalQueueItems();
    const latestProcessed = salesOpsOutputs.readLatestBatchProcessed();
    const latestBatchExists =
      salesOpsOutputs.getLatestOutreachBatchJsonPath() !== null;
    const latestDailySummaryExists =
      salesOpsOutputs.getLatestDailySummaryJsonPath() !== null;
    const latestRevenueCommandExists =
      salesOpsOutputs.getLatestRevenueCommandJsonPath() !== null;
    const latestConversionExists =
      salesOpsOutputs.getConversionsLogPath() &&
      fs.existsSync(salesOpsOutputs.getConversionsLogPath());
    const founderRevenueScore = getFounderRevenueScore({
      outreach: { processed: latestProcessed },
      queue: {
        approved: queue.approved,
        sent: queue.sent,
        failed: queue.failed,
        pendingFollowup: queue.pending_followup
      },
      system: {
        autoSend: process.env.AUTO_SEND === "true",
        dryRun: process.env.DRY_RUN === "true"
      }
    }).score;
    const pendingFollowup = Number(queue.pending_followup) || 0;
    const avgOrder = Number(process.env.AVG_ORDER_VALUE || 350);
    const pipelineValue =
      (Number(queue.pending) || 0) * avgOrder +
      (Number(queue.approved) || 0) * avgOrder;
    const nextBestAction =
      getNextBestCashActions({
        outreach: {
          processed: latestProcessed,
          hotLeads: Number(queue.approved) || 0,
          messagesGenerated: Number(queue.pending) || 0
        },
        queue: {
          pending: queue.pending,
          approved: queue.approved,
          sent: queue.sent,
          failed: queue.failed,
          pendingFollowup
        },
        system: {
          autoSend: process.env.AUTO_SEND === "true",
          dryRun: process.env.DRY_RUN === "true"
        }
      })[0] || "Review queue";
    const alerts = [];
    if ((Number(queue.failed) || 0) > 0) alerts.push("Failed sends need attention");
    if (pendingFollowup > 0) alerts.push("Follow-up queue pending");
    if ((Number(queue.approved) || 0) > 0 && process.env.AUTO_SEND !== "true") {
      alerts.push("Approved outreach waiting for operator send");
    }

    return res.status(200).json({
      success: true,
      system: {
        autoSend: process.env.AUTO_SEND === "true",
        dryRun: process.env.DRY_RUN === "true",
        maxSend: (() => {
          const n = parseInt(process.env.MAX_SEND || "2", 10);
          return Number.isFinite(n) ? n : 2;
        })()
      },
      founderRevenueScore,
      pendingFollowup,
      pipelineValue,
      nextBestAction,
      alerts,
      queue,
      latestBatchExists,
      latestDailySummaryExists,
      latestRevenueCommandExists,
      latestConversionExists,
      readyState: computeReadyState(queue, totalItems, latestProcessed)
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(200).json({
      success: false,
      error: msg
    });
  }
});

module.exports = router;
