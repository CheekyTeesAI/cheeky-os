/**
 * Approved outreach send route with AUTO_SEND gate.
 */
"use strict";
const { Router } = require("express");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const { logAudit } = require("../utils/auditLogger");
const env = require("../utils/routeEnvelope");
const router = Router();
router.post("/outreach/send-approved", async (_req, res) => {
    const stage = "outreach.send-approved";
    try {
        if (process.env.AUTO_SEND !== "true") {
            return res.status(200).json(env.fail(stage, "AUTO_SEND_DISABLED"));
        }
        const r = await approvalQueue.sendApprovedQueueSubset();
        logAudit(stage, r);
        return res.status(200).json(env.ok(stage, {
            sent: r.sent,
            failed: r.failed,
            eligibleHot: r.eligibleHot,
            batchSize: r.batchSize
        }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err, { sent: 0, failed: 0 }));
    }
});
module.exports = router;
