"use strict";
const approvalQueue = require("../helpers/outreachApprovalQueue");
const salesOpsOutputs = require("../helpers/salesOpsOutputs");
const { internalHttpCall } = require("../utils/internalHttpCall");
function internalPort() {
    return Number(process.env.PORT || 3000);
}
async function runDailyPipeline(port) {
    void port;
    console.log("=== DAILY RUN START ===");
    try {
        await internalHttpCall("/outreach/daily-run", { method: "POST" });
        await internalHttpCall("/outreach/followup-run", { method: "POST" });
        if (process.env.AUTO_SEND === "true") {
            await internalHttpCall("/outreach/send-approved", { method: "POST" });
        }
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("DAILY PIPELINE ERROR:", msg);
    }
    console.log("=== DAILY RUN END ===");
}
function startDailyScheduler(opts) {
    const port = (opts && opts.port) || internalPort();
    const ms = 24 * 60 * 60 * 1000;
    setInterval(() => {
        void runDailyPipeline(port);
    }, ms);
    console.log(`Daily revenue scheduler: interval ${ms}ms (24h), port ${port}`);
}
function logRevenueEngineOnline() {
    const q = approvalQueue.getQueueCounts();
    const autoOn = process.env.AUTO_SEND === "true";
    const pendingReview = (Number(q.pending) || 0) + (Number(q.pending_followup) || 0);
    let next = "Monitor /ops/status";
    if (q.approved > 0) {
        next =
            "POST /outreach/send-approved when ready (requires AUTO_SEND=true)";
    }
    else if (pendingReview > 0) {
        next = "Review /outreach/queue (pending + follow-ups)";
    }
    else if (approvalQueue.totalQueueItems() === 0 &&
        salesOpsOutputs.readLatestBatchProcessed() === 0) {
        next = "Run POST /outreach/daily-run or refresh lead source";
    }
    console.log("CHEEKY OS REVENUE ENGINE ONLINE");
    console.log(`AutoSend: ${autoOn ? "ON" : "OFF"}`);
    console.log("Queue counts:", JSON.stringify(q));
    console.log("Next action:", next);
}
module.exports = {
    runDailyPipeline,
    startDailyScheduler,
    logRevenueEngineOnline
};
