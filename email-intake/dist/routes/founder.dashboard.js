/**
 * Founder dashboard snapshot route.
 */
"use strict";
const fs = require("fs");
const { Router } = require("express");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const salesOpsOutputs = require("../helpers/salesOpsOutputs");
const { getFounderRevenueScore } = require("../actions/revenue/getFounderRevenueScore");
const { getNextBestCashActions } = require("../actions/revenue/getNextBestCashActions");
const env = require("../utils/routeEnvelope");
const router = Router();
function readJson(path) {
    return JSON.parse(fs.readFileSync(path, "utf8"));
}
router.get("/founder/dashboard", (_req, res) => {
    const stage = "founder.dashboard";
    try {
        const latestDaily = salesOpsOutputs.getLatestDailySummaryJsonPath();
        const latestBatch = salesOpsOutputs.getLatestOutreachBatchJsonPath();
        if (!latestDaily || !latestBatch) {
            return res.status(200).json(env.fail(stage, "No founder dashboard data available"));
        }
        const daily = readJson(latestDaily);
        const batch = readJson(latestBatch);
        const outreach = {
            processed: Number(batch.processed) || 0,
            hotLeads: Number(batch.hotLeads) || 0,
            offersBuilt: Number(batch.offersBuilt) || 0,
            messagesGenerated: Number(batch.messagesGenerated) || 0,
            estimatesCreated: Number(batch.estimatesCreated) || 0,
            followUpsScheduled: Number(batch.followUpsScheduled) || 0
        };
        const q = approvalQueue.getQueueCounts();
        const queue = {
            pending: Number(q.pending) || 0,
            approved: Number(q.approved) || 0,
            sent: Number(q.sent) || 0,
            failed: Number(q.failed) || 0,
            pendingFollowup: Number(q.pending_followup) || 0
        };
        const system = {
            autoSend: process.env.AUTO_SEND === "true",
            dryRun: process.env.DRY_RUN === "true",
            maxSend: parseInt(process.env.MAX_SEND || "2", 10)
        };
        const score = getFounderRevenueScore({ outreach, queue, system });
        const nextBestActions = getNextBestCashActions({ outreach, queue, system });
        return res.status(200).json(env.ok(stage, {
            snapshotAt: daily.runAt || new Date().toISOString(),
            score: { value: score.score, label: score.label },
            outreach,
            queue,
            nextBestActions
        }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, "No founder dashboard data available", { detail: String(err) }));
    }
});
module.exports = router;
