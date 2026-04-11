/**
 * Reactivation campaign routes (import/score/message/queue/send/log/intel).
 */
"use strict";
const { Router } = require("express");
const nodemailer = require("nodemailer");
const { appendQueue, readQueue, updateStatus, appendConversion, readConversions } = require("../helpers/reactivationStore");
const env = require("../utils/routeEnvelope");
const { logAudit } = require("../utils/auditLogger");
const router = Router();
function scoreReactivation(c) {
    const spend = Number(c.totalSpent || 0);
    const recency = Number(c.lastOrderDaysAgo || 180);
    const score = Math.max(0, Math.min(100, Math.floor(spend / 50) + Math.max(0, 70 - Math.floor(recency / 3))));
    return score;
}
function msgFor(c, score) {
    const biz = process.env.CHEEKY_BIZ_NAME || "Cheeky Tees";
    const phone = process.env.CHEEKY_PHONE || "864-498-3475";
    const first = String(c.name || "there").split(/\s+/)[0] || "there";
    const subject = score >= 70 ? `${biz}: quick comeback offer` : `${biz}: check-in`;
    const text = `Hey ${first}, we would love to print for you again. If you have anything coming up, reply and we can turn it fast.\n\n— ${biz}\n${phone}`;
    return { subject, text };
}
async function loadSquareCustomersFallback() {
    if (!process.env.SQUARE_ACCESS_TOKEN) {
        return [
            { id: "sq_mock_1", name: "Local HVAC", email: "local@example.com", totalSpent: 1200, lastOrderDaysAgo: 180 },
            { id: "sq_mock_2", name: "Booster Club", email: "club@example.com", totalSpent: 700, lastOrderDaysAgo: 220 }
        ];
    }
    try {
        const token = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
        const res = await fetch("https://connect.squareup.com/v2/customers", {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok)
            throw new Error(`SQUARE_HTTP_${res.status}`);
        const data = await res.json();
        const customers = Array.isArray(data.customers) ? data.customers : [];
        return customers.map((c) => ({
            id: c.id,
            name: `${c.given_name || ""} ${c.family_name || ""}`.trim() || c.company_name || "Customer",
            email: c.email_address || "",
            totalSpent: 500,
            lastOrderDaysAgo: 180
        })).filter((c) => c.email);
    }
    catch (_e) {
        return [
            { id: "sq_mock_1", name: "Local HVAC", email: "local@example.com", totalSpent: 1200, lastOrderDaysAgo: 180 }
        ];
    }
}
router.post("/reactivation/run", async (_req, res) => {
    const stage = "reactivation.run";
    try {
        const customers = await loadSquareCustomersFallback();
        const autoApprove = process.env.REACTIVATION_AUTO_APPROVE === "true";
        const rows = customers.map((c, i) => {
            const score = scoreReactivation(c);
            const m = msgFor(c, score);
            return {
                id: `rq_${Date.now()}_${i}`,
                customerId: c.id,
                to: c.email,
                subject: m.subject,
                text: m.text,
                score,
                status: autoApprove ? "approved" : "pending",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                sendError: null
            };
        });
        appendQueue(rows);
        logAudit("reactivation.run", { imported: customers.length, queued: rows.length, autoApprove });
        return res.status(200).json(env.ok(stage, { imported: customers.length, queued: rows.length }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err));
    }
});
router.post("/reactivation/send-approved", async (_req, res) => {
    const stage = "reactivation.send-approved";
    try {
        const autoSend = process.env.AUTO_SEND === "true";
        const dryRun = process.env.DRY_RUN === "true";
        const maxSend = Math.max(1, parseInt(process.env.MAX_SEND || "2", 10));
        const approved = readQueue().filter((x) => x.status === "approved").slice(0, maxSend);
        if (!autoSend || dryRun) {
            return res.status(200).json(env.ok(stage, { attempted: 0, sent: 0, failed: 0, dryRun, autoSend, wouldSend: approved.length }));
        }
        const transporter = nodemailer.createTransport({
            host: "smtp.office365.com",
            port: 587,
            secure: false,
            auth: { user: process.env.OUTREACH_EMAIL, pass: process.env.OUTREACH_PASSWORD }
        });
        let sent = 0;
        let failed = 0;
        for (const row of approved) {
            try {
                await transporter.sendMail({
                    from: `"${process.env.CHEEKY_BIZ_NAME || "Cheeky Tees"}" <${process.env.OUTREACH_EMAIL}>`,
                    to: row.to,
                    subject: row.subject,
                    text: row.text
                });
                updateStatus(row.id, "sent", null);
                sent++;
            }
            catch (e) {
                updateStatus(row.id, "failed", e instanceof Error ? e.message : String(e));
                failed++;
            }
        }
        logAudit("reactivation.send-approved", { attempted: approved.length, sent, failed });
        return res.status(200).json(env.ok(stage, { attempted: approved.length, sent, failed }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err));
    }
});
router.post("/reactivation/log-conversion", (req, res) => {
    const stage = "reactivation.log-conversion";
    try {
        const customerId = String((req.body && req.body.customerId) || "").trim();
        if (!customerId)
            return res.status(200).json(env.fail(stage, "customerId required"));
        appendConversion({
            id: `rconv_${Date.now()}`,
            customerId,
            note: String((req.body && req.body.note) || ""),
            estimatedValue: Number((req.body && req.body.estimatedValue) || 0),
            createdAt: new Date().toISOString()
        });
        logAudit("reactivation.log-conversion", { customerId });
        return res.status(200).json(env.ok(stage, { logged: true }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err));
    }
});
router.get("/reactivation/intel", (_req, res) => {
    const stage = "reactivation.intel";
    try {
        const q = readQueue();
        const conv = readConversions();
        const byStatus = (s) => q.filter((x) => x.status === s).length;
        const estimatedPipelineValue = q.reduce((acc, x) => acc + ((Number(x.score) || 0) * Number(process.env.AVG_ORDER_VALUE || 350) / 100), 0);
        const conversionValue = conv.reduce((acc, x) => acc + (Number(x.estimatedValue) || 0), 0);
        return res.status(200).json(env.ok(stage, {
            queue: {
                pending: byStatus("pending"),
                approved: byStatus("approved"),
                sent: byStatus("sent"),
                failed: byStatus("failed")
            },
            conversions: conv.length,
            estimatedPipelineValue,
            conversionValue
        }));
    }
    catch (err) {
        return res.status(200).json(env.fail(stage, err));
    }
});
module.exports = router;
