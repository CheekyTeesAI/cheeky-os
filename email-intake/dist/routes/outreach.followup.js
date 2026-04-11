/**
 * Follow-up run route for sent outreach older than two days.
 */
"use strict";
const { Router } = require("express");
const { generateClosingMessage } = require("../actions/outreach/generateClosingMessage");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const { logAudit } = require("../utils/auditLogger");
const env = require("../utils/routeEnvelope");
const router = Router();
const TWO_D_MS = 2 * 24 * 60 * 60 * 1000;
function sentTimestampMs(it) {
    const t = it.sentAt || it.updatedAt;
    if (!t)
        return 0;
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) ? ms : 0;
}
router.post("/outreach/followup-run", (_req, res) => {
    const stage = "outreach.followup-run";
    try {
        const sentItems = approvalQueue.getItems("sent");
        const now = Date.now();
        const eligible = sentItems.filter((it) => now - sentTimestampMs(it) > TWO_D_MS);
        let followupsCreated = 0;
        for (let i = 0; i < eligible.length; i++) {
            const it = eligible[i];
            if (approvalQueue.hasPendingFollowupForSource(it.id))
                continue;
            const closing = generateClosingMessage({ id: it.customerId, name: "", email: it.to }, 55);
            approvalQueue.appendFollowupQueueItem({
                id: `fq_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`,
                customerId: it.customerId,
                to: it.to,
                subject: `Follow-up: ${closing.subject}`,
                text: `Following up on my last note — ${closing.message}`,
                sourceMessageId: it.id
            });
            followupsCreated++;
        }
        logAudit(stage, { scanned: sentItems.length, followupsCreated });
        return res.status(200).json(env.ok(stage, { scanned: sentItems.length, followupsCreated }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err, { scanned: 0, followupsCreated: 0 }));
    }
});
module.exports = router;
