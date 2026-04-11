/**
 * Revenue command route orchestrating full daily revenue cycle.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Router } = require("express");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const salesOpsOutputs = require("../helpers/salesOpsOutputs");
const { internalHttpCall } = require("../utils/internalHttpCall");
const { getFounderRevenueScore } = require("../actions/revenue/getFounderRevenueScore");
const { getNextBestCashActions } = require("../actions/revenue/getNextBestCashActions");
const { logAudit } = require("../utils/auditLogger");
const env = require("../utils/routeEnvelope");
const router = Router();
function tsLocal() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function readLatestOutreach() {
    const latest = salesOpsOutputs.getLatestOutreachBatchJsonPath();
    if (!latest) {
        return {
            processed: 0,
            hotLeads: 0,
            offersBuilt: 0,
            messagesGenerated: 0,
            estimatesCreated: 0,
            followUpsScheduled: 0
        };
    }
    try {
        const raw = fs.readFileSync(latest, "utf8");
        const data = JSON.parse(raw);
        return {
            processed: Number(data.processed) || 0,
            hotLeads: Number(data.hotLeads) || 0,
            offersBuilt: Number(data.offersBuilt) || 0,
            messagesGenerated: Number(data.messagesGenerated) || 0,
            estimatesCreated: Number(data.estimatesCreated) || 0,
            followUpsScheduled: Number(data.followUpsScheduled) || 0
        };
    }
    catch (_e) {
        return {
            processed: 0,
            hotLeads: 0,
            offersBuilt: 0,
            messagesGenerated: 0,
            estimatesCreated: 0,
            followUpsScheduled: 0
        };
    }
}
function queueShape(counts) {
    return {
        pending: Number(counts.pending) || 0,
        approved: Number(counts.approved) || 0,
        sent: Number(counts.sent) || 0,
        failed: Number(counts.failed) || 0,
        pendingFollowup: Number(counts.pending_followup) || 0
    };
}
function buildFounderSummary(outreach, queue, scoreObj) {
    return {
        immediateRevenueOpsScore: scoreObj.score,
        hotLeadCount: outreach.hotLeads,
        readyToSendCount: queue.approved,
        followupNeededCount: queue.pendingFollowup,
        blockedCount: queue.failed
    };
}
function writeRevenueCommandArtifacts(runAt, scoreObj, outreach, queue, nextBestActions) {
    const dir = salesOpsOutputs.revenueDir();
    fs.mkdirSync(dir, { recursive: true });
    const stem = `revenue-command-${tsLocal()}`;
    const jsonPath = path.join(dir, `${stem}.json`);
    const txtPath = path.join(dir, `${stem}.txt`);
    const payload = {
        runAt,
        score: scoreObj,
        outreach,
        queue,
        nextBestActions
    };
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");
    const lines = [
        "CHEEKY OS REVENUE COMMAND",
        `Run At: ${runAt}`,
        `Score: ${scoreObj.score}`,
        `Label: ${scoreObj.label}`,
        "",
        "OUTREACH:",
        `Processed: ${outreach.processed}`,
        `Hot Leads: ${outreach.hotLeads}`,
        `Messages Generated: ${outreach.messagesGenerated}`,
        `Sent: ${queue.sent}`,
        `Failed: ${queue.failed}`,
        `Pending Followups: ${queue.pendingFollowup}`,
        "",
        "NEXT BEST ACTIONS:"
    ];
    nextBestActions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push("");
    fs.writeFileSync(txtPath, lines.join("\n"), "utf8");
}
router.post("/revenue/command", async (_req, res) => {
    const stage = "revenue.command";
    const runAt = new Date().toISOString();
    const system = {
        autoSend: process.env.AUTO_SEND === "true",
        dryRun: process.env.DRY_RUN === "true",
        maxSend: (() => {
            const n = parseInt(process.env.MAX_SEND || "2", 10);
            return Number.isFinite(n) ? n : 2;
        })()
    };
    try {
        const daily = await internalHttpCall("/outreach/daily-run", { method: "POST" });
        const followup = await internalHttpCall("/outreach/followup-run", { method: "POST" });
        const recovery = await internalHttpCall("/outreach/recovery-run", { method: "POST" });
        const reactivation = await internalHttpCall("/reactivation/run", { method: "POST" });
        let sendResult = { skipped: true };
        if (system.autoSend) {
            sendResult = await internalHttpCall("/outreach/send-approved", {
                method: "POST"
            });
            if (!system.dryRun) {
                await internalHttpCall("/reactivation/send-approved", { method: "POST" });
            }
        }
        const outreach = readLatestOutreach();
        const queue = queueShape(approvalQueue.getQueueCounts());
        const scoreObj = getFounderRevenueScore({ outreach, queue, system });
        const founderSummary = buildFounderSummary(outreach, queue, scoreObj);
        const nextBestActions = getNextBestCashActions({ outreach, queue, system });
        const data = {
            runAt,
            system,
            outreach,
            queue,
            founderSummary,
            nextBestActions,
            pipeline: {
                daily,
                followup,
                recovery,
                reactivation,
                send: sendResult
            }
        };
        writeRevenueCommandArtifacts(runAt, scoreObj, outreach, queue, nextBestActions);
        logAudit(stage, { runAt, queue, system });
        return res.status(200).json(env.ok(stage, data));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err, { runAt, system }));
    }
});
module.exports = router;
