/**
 * Dead lead recovery route: re-score stale/failed queue and requeue as pending.
 */
"use strict";
const { Router } = require("express");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const { scoreLead } = require("../actions/revenue/leadScorer");
const { assignCampaignType } = require("../actions/revenue/campaignBuilder");
const { buildMessage } = require("../actions/revenue/messageBuilder");
const { logAudit } = require("../utils/auditLogger");
const env = require("../utils/routeEnvelope");
const router = Router();
const THREE_D_MS = 3 * 24 * 60 * 60 * 1000;
router.post("/outreach/recovery-run", (req, res) => {
    const stage = "outreach.recovery-run";
    try {
        const now = Date.now();
        const stale = approvalQueue
            .getItems()
            .filter((x) => x.status === "failed" || (x.status === "pending_followup" && now - new Date(x.updatedAt || x.createdAt || 0).getTime() > THREE_D_MS));
        const recovered = stale.map((it) => {
            const customer = {
                id: it.customerId,
                name: it.to,
                email: it.to,
                lastOrderDaysAgo: 45,
                totalSpent: 500
            };
            const s = scoreLead(customer);
            const campaign = assignCampaignType(s.score, customer.lastOrderDaysAgo);
            const msg = buildMessage(customer, s.tier, campaign);
            return {
                customerId: it.customerId,
                to: it.to,
                subject: msg.subject,
                text: msg.text
            };
        });
        approvalQueue.appendFromMessages(recovered);
        logAudit("outreach.recovery-run", { scanned: stale.length, requeued: recovered.length });
        return res.status(200).json(env.ok(stage, { scanned: stale.length, requeued: recovered.length }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err));
    }
});
module.exports = router;
