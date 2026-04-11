/**
 * Revenue intelligence route for pipeline visibility.
 */
"use strict";
const { Router } = require("express");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const { getNextBestCashActions } = require("../actions/revenue/getNextBestCashActions");
const env = require("../utils/routeEnvelope");
const router = Router();
router.get("/revenue/intel", (_req, res) => {
    const stage = "revenue.intel";
    try {
        const q = approvalQueue.getQueueCounts();
        const avg = Number(process.env.AVG_ORDER_VALUE || 350);
        const estimatedRevenue = ((q.approved || 0) + (q.pending || 0)) * avg;
        const outreach = { processed: 0, hotLeads: q.approved || 0, messagesGenerated: q.pending || 0 };
        const queue = { pending: q.pending, approved: q.approved, sent: q.sent, failed: q.failed, pendingFollowup: q.pending_followup };
        const system = { autoSend: process.env.AUTO_SEND === "true", dryRun: process.env.DRY_RUN === "true" };
        const nextBestAction = getNextBestCashActions({ outreach, queue, system })[0] || "Review queue";
        return res.status(200).json(env.ok(stage, { pipelineValue: estimatedRevenue, estimatedRevenue, nextBestAction }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err));
    }
});
module.exports = router;
