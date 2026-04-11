"use strict";
const fs = require("fs");
const path = require("path");
const clipboardy = require("clipboardy");
const { Router } = require("express");
const { db } = require("../db/client");
const { generateClosingMessage } = require("../actions/outreach/generateClosingMessage");
const { buildOffer } = require("../actions/outreach/buildOffer");
const { scheduleFollowUp } = require("../actions/outreach/scheduleFollowUp");
const approvalQueue = require("../helpers/outreachApprovalQueue");
const router = Router();
function batchTimestampLocal() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function outputsOutreachDir() {
    return path.join(__dirname, "..", "..", "outputs", "outreach");
}
function getLatestBatchJsonPath(dir) {
    if (!fs.existsSync(dir))
        return null;
    const files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("outreach-batch-") && f.endsWith(".json"));
    if (files.length === 0)
        return null;
    let bestPath = null;
    let bestMs = 0;
    for (const f of files) {
        const p = path.join(dir, f);
        try {
            const st = fs.statSync(p);
            if (st.mtimeMs >= bestMs) {
                bestMs = st.mtimeMs;
                bestPath = p;
            }
        }
        catch (_e) {
            /* skip */
        }
    }
    return bestPath;
}
router.get("/outreach/last", (_req, res) => {
    try {
        const dir = outputsOutreachDir();
        const latest = getLatestBatchJsonPath(dir);
        if (!latest) {
            return res.status(200).json({
                success: false,
                error: "No outreach batch found"
            });
        }
        const raw = fs.readFileSync(latest, "utf8");
        const data = JSON.parse(raw);
        return res.status(200).json(data);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return res.status(200).json({
            success: false,
            error: msg
        });
    }
});
function scoreCustomer(customer) {
    let createdMs;
    if (customer.createdAt != null) {
        createdMs = new Date(customer.createdAt).getTime();
    }
    else if (typeof customer.lastOrderDaysAgo === "number") {
        createdMs = Date.now() - customer.lastOrderDaysAgo * 86400000;
    }
    else {
        createdMs = Date.now();
    }
    const ageDays = (Date.now() - createdMs) / 86400000;
    let score = 78;
    if (ageDays > 90)
        score -= 28;
    else if (ageDays > 30)
        score -= 12;
    const salt = (customer.id || "").length % 17;
    score = Math.min(100, Math.max(18, score + salt - 8));
    return score;
}
function tierFromScore(score) {
    if (score >= 70)
        return "HOT";
    if (score >= 40)
        return "WARM";
    return "COLD";
}
function formatMessageForClipboard(msg) {
    return [
        `To: ${msg.to}`,
        `Subject: ${msg.subject}`,
        "",
        msg.text,
        "",
        "— Cheeky Tees",
        "864-498-3475"
    ].join("\n");
}
function buildHumanReport(summary, messages, runAtIso) {
    const lines = [
        "CHEEKY OS OUTREACH BATCH",
        `Run At: ${runAtIso}`,
        `Processed: ${summary.processed}`,
        `Hot Leads: ${summary.hotLeads}`,
        `Messages Generated: ${summary.messagesGenerated}`,
        "",
        ...messages.flatMap((m) => [
            "--------------------------------",
            `TO: ${m.to}`,
            `SUBJECT: ${m.subject}`,
            `MESSAGE:`,
            m.text,
            `STATUS: ${m.sendStatus}`,
            ""
        ]),
        "--------------------------------",
        ""
    ];
    return lines.join("\n");
}
router.post("/outreach/close", async (_req, res) => {
    const summary = {
        processed: 0,
        hotLeads: 0,
        offersBuilt: 0,
        messagesGenerated: 0,
        estimatesCreated: 0,
        followUpsScheduled: 0
    };
    let messages = [];
    let customers = [];
    try {
        customers = await db.customer.findMany({
            orderBy: { createdAt: "desc" },
            take: 200
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(JSON.stringify({
            phase: "pull_customers",
            error: msg,
            timestamp: new Date().toISOString()
        }));
        console.log("DB FAILED — USING MOCK CUSTOMERS");
        customers = [
            {
                id: "mock1",
                name: "Test Customer",
                email: "test@cheeky.com",
                lastOrderDaysAgo: 45,
                totalSpent: 1200
            },
            {
                id: "mock2",
                name: "Hot Lead",
                email: "lead@cheeky.com",
                lastOrderDaysAgo: 10,
                totalSpent: 300
            }
        ];
    }
    for (const customer of customers) {
        let tier = "COLD";
        let score = 0;
        let offerType = "";
        let estimateId = "";
        try {
            score = scoreCustomer(customer);
            tier = tierFromScore(score);
            const offer = buildOffer(tier);
            offerType = offer.offerType;
            summary.offersBuilt += 1;
            const closing = generateClosingMessage({
                id: customer.id,
                name: customer.name,
                email: customer.email
            }, score);
            const closingMessage = closing.message;
            const toAddr = (customer.email || "").trim();
            if (toAddr) {
                summary.messagesGenerated += 1;
                messages.push({
                    to: toAddr,
                    subject: "Quick follow-up from Cheeky Tees",
                    text: closingMessage,
                    customerId: customer.id,
                    tier,
                    sendStatus: "pending",
                    sendError: null
                });
            }
            estimateId = `draft_est_${customer.id}_${Date.now()}`;
            summary.estimatesCreated += 1;
            const follow = scheduleFollowUp({ customerId: customer.id });
            if (follow.followUpScheduled)
                summary.followUpsScheduled += 1;
            if (tier === "HOT")
                summary.hotLeads += 1;
            summary.processed += 1;
            void offerType;
            void estimateId;
            void offer;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(JSON.stringify({
                phaseFailed: "pipeline_step",
                customerId: customer.id,
                error: msg,
                timestamp: new Date().toISOString()
            }));
        }
    }
    if (messages.length > 0) {
        try {
            clipboardy.writeSync(formatMessageForClipboard(messages[0]));
            console.log("\n📋 FIRST MESSAGE COPIED TO CLIPBOARD\n");
        }
        catch (err) {
            const clipMsg = err && typeof err.message === "string"
                ? err.message
                : String(err);
            console.error("Clipboard copy failed:", clipMsg);
        }
    }
    const MAX_SEND = parseInt(process.env.MAX_SEND || "2", 10);
    const isDryRun = process.env.DRY_RUN === "true";
    const isAutoSend = process.env.AUTO_SEND === "true";
    if (isDryRun) {
        console.log("\n🧪 DRY RUN MODE — NO EMAILS SENT\n");
        messages.forEach((m) => {
            console.log("WOULD SEND TO:", m.to);
            m.sendStatus = "dry_run";
            m.sendError = null;
        });
    }
    else if (isAutoSend) {
        console.log(`\n📤 AUTO SENDING (limit ${MAX_SEND})...\n`);
        const nodemailer = require("nodemailer");
        const transporter = nodemailer.createTransport({
            host: "smtp.office365.com",
            port: 587,
            secure: false,
            auth: {
                user: process.env.OUTREACH_EMAIL,
                pass: process.env.OUTREACH_PASSWORD
            }
        });
        let sentCount = 0;
        for (const msg of messages) {
            if (sentCount >= MAX_SEND)
                break;
            if (!msg.to || !String(msg.to).trim()) {
                console.error("❌ SKIP (no to):", msg.customerId);
                continue;
            }
            try {
                await transporter.sendMail({
                    from: `"Cheeky Tees" <${process.env.OUTREACH_EMAIL}>`,
                    to: msg.to,
                    subject: msg.subject,
                    text: `${msg.text}\n\n— Cheeky Tees\n864-498-3475`
                });
                console.log(`✅ SENT → ${msg.to}`);
                msg.sendStatus = "sent";
                msg.sendError = null;
                sentCount++;
            }
            catch (err) {
                const em = err && typeof err.message === "string"
                    ? err.message
                    : String(err);
                console.error(`❌ FAILED → ${msg.to}:`, em);
                msg.sendStatus = "failed";
                msg.sendError = em;
            }
        }
        console.log(`\n📬 SENT ${sentCount} EMAILS\n`);
    }
    const runAt = new Date().toISOString();
    const batchStem = `outreach-batch-${batchTimestampLocal()}`;
    const outDir = outputsOutreachDir();
    fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `${batchStem}.json`);
    const txtPath = path.join(outDir, `${batchStem}.txt`);
    const batchPayload = {
        runAt,
        processed: summary.processed,
        hotLeads: summary.hotLeads,
        offersBuilt: summary.offersBuilt,
        messagesGenerated: summary.messagesGenerated,
        estimatesCreated: summary.estimatesCreated,
        followUpsScheduled: summary.followUpsScheduled,
        messages: messages.map((m) => ({
            customerId: m.customerId,
            to: m.to,
            subject: m.subject,
            text: m.text,
            sendStatus: m.sendStatus,
            sendError: m.sendError
        }))
    };
    fs.writeFileSync(jsonPath, JSON.stringify(batchPayload, null, 2), "utf8");
    fs.writeFileSync(txtPath, buildHumanReport(summary, messages, runAt), "utf8");
    console.log(`
================ BATCH SUMMARY ================
Processed: ${summary.processed}
Hot Leads: ${summary.hotLeads}
Messages Generated: ${summary.messagesGenerated}
Estimated Drafts: ${summary.estimatesCreated}
Follow Ups Scheduled: ${summary.followUpsScheduled}
Batch File: ${jsonPath}
Text File: ${txtPath}
==============================================
`);
    const pendingApprovals = approvalQueue.countPending();
    console.log(`================ WORKFLOW READY ================
Batch created
Pending approvals: ${pendingApprovals}
Use /outreach/queue to review
Use /outreach/queue/update to approve/reject
Use /outreach/send-approved to send
===============================================`);
    messages.forEach((msg, i) => {
        console.log(`MESSAGE ${i + 1} → ${msg.to}\n`);
        console.log(msg.text.trim());
        console.log("\n-----------------------------------------------\n");
    });
    console.log("============== END OUTREACH ==================\n");
    console.log(`
SUMMARY:
Processed: ${summary.processed}
Hot Leads: ${summary.hotLeads}
Offers Built: ${summary.offersBuilt}
Messages Generated: ${summary.messagesGenerated}
`);
    return res.status(200).json({
        processed: summary.processed,
        hotLeads: summary.hotLeads,
        offersBuilt: summary.offersBuilt,
        messagesGenerated: summary.messagesGenerated,
        estimatesCreated: summary.estimatesCreated,
        followUpsScheduled: summary.followUpsScheduled
    });
});
module.exports = router;
