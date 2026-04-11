"use strict";
const fs = require("fs");
const path = require("path");
function queueFilePath() {
    return path.join(__dirname, "..", "..", "outputs", "outreach", "approval-queue.json");
}
function ensureDir() {
    const dir = path.dirname(queueFilePath());
    fs.mkdirSync(dir, { recursive: true });
}
function initIfMissing() {
    ensureDir();
    const p = queueFilePath();
    if (!fs.existsSync(p)) {
        const empty = {
            updatedAt: new Date().toISOString(),
            items: []
        };
        fs.writeFileSync(p, JSON.stringify(empty, null, 2), "utf8");
    }
}
function readQueue() {
    initIfMissing();
    const raw = fs.readFileSync(queueFilePath(), "utf8");
    return JSON.parse(raw);
}
function writeQueue(q) {
    ensureDir();
    q.updatedAt = new Date().toISOString();
    fs.writeFileSync(queueFilePath(), JSON.stringify(q, null, 2), "utf8");
}
function isDuplicate(items, customerId, subject, text) {
    return items.some((x) => x.customerId === customerId &&
        x.subject === subject &&
        x.text === text);
}
function appendFromMessages(messages) {
    initIfMissing();
    const q = readQueue();
    const now = new Date().toISOString();
    let n = 0;
    for (let index = 0; index < messages.length; index++) {
        const m = messages[index];
        if (!m || !m.to)
            continue;
        if (isDuplicate(q.items, m.customerId, m.subject, m.text))
            continue;
        n += 1;
        const id = `oq_${Date.now()}_${index}`;
        const tier = m.tier || m.leadTier || null;
        q.items.push({
            id,
            customerId: m.customerId,
            to: m.to,
            subject: m.subject,
            text: m.text,
            tier,
            status: "pending",
            createdAt: now,
            updatedAt: now,
            sendError: null
        });
    }
    if (n > 0)
        writeQueue(q);
}
function countByStatus(status) {
    initIfMissing();
    const q = readQueue();
    return q.items.filter((x) => x.status === status).length;
}
function countPending() {
    return countByStatus("pending");
}
function getQueueCounts() {
    initIfMissing();
    return {
        pending: countByStatus("pending"),
        pending_followup: countByStatus("pending_followup"),
        approved: countByStatus("approved"),
        sent: countByStatus("sent"),
        failed: countByStatus("failed")
    };
}
function totalQueueItems() {
    initIfMissing();
    return readQueue().items.length;
}
function getItems(statusFilter) {
    initIfMissing();
    const q = readQueue();
    if (!statusFilter)
        return [...q.items];
    return q.items.filter((x) => x.status === statusFilter);
}
function updateItem(id, status) {
    initIfMissing();
    const q = readQueue();
    const it = q.items.find((x) => x.id === id);
    if (!it)
        return null;
    it.status = status;
    it.updatedAt = new Date().toISOString();
    writeQueue(q);
    return { ...it };
}
function createOutlookTransporter() {
    const nodemailer = require("nodemailer");
    return nodemailer.createTransport({
        host: "smtp.office365.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.OUTREACH_EMAIL,
            pass: process.env.OUTREACH_PASSWORD
        }
    });
}
async function sendQueueSubset(itemsToSend, opts) {
    const maxSend = opts.maxSend;
    const dryRun = opts.dryRun;
    const autoSend = opts.autoSend;
    const moneyMode = opts.moneyMode === true;
    const eligibleHotCount = typeof opts.eligibleHotCount === "number"
        ? opts.eligibleHotCount
        : itemsToSend.length;
    const wouldSend = itemsToSend.map((it) => ({
        id: it.id,
        to: it.to,
        subject: it.subject
    }));
    const results = [];
    let attempted = 0;
    let sent = 0;
    let failed = 0;
    if (dryRun) {
        if (moneyMode) {
            console.log(`MONEY MODE (DRY RUN): would send ${itemsToSend.length} HOT leads`);
        }
        return {
            wouldSend,
            results,
            attempted: 0,
            sent: 0,
            failed: 0
        };
    }
    if (!autoSend) {
        return {
            wouldSend: [],
            results,
            attempted: 0,
            sent: 0,
            failed: 0
        };
    }
    if (moneyMode) {
        console.log(`=== MONEY MODE ===
Eligible HOT leads: ${eligibleHotCount}
Sending now: ${itemsToSend.length}
==================`);
    }
    const transporter = createOutlookTransporter();
    const q = readQueue();
    for (const it of itemsToSend) {
        if (sent >= maxSend)
            break;
        if (!it.to || !String(it.to).trim()) {
            results.push({ id: it.id, to: it.to, outcome: "skipped", error: "no to" });
            continue;
        }
        attempted++;
        try {
            await transporter.sendMail({
                from: `"Cheeky Tees" <${process.env.OUTREACH_EMAIL}>`,
                to: it.to,
                subject: it.subject,
                text: `${it.text}\n\n— Cheeky Tees\n864-498-3475`
            });
            const stored = q.items.find((x) => x.id === it.id);
            if (stored) {
                const iso = new Date().toISOString();
                stored.status = "sent";
                stored.sendError = null;
                stored.updatedAt = iso;
                stored.sentAt = iso;
            }
            writeQueue(q);
            sent++;
            results.push({ id: it.id, to: it.to, outcome: "sent" });
        }
        catch (err) {
            const em = err && typeof err.message === "string"
                ? err.message
                : String(err);
            const stored = q.items.find((x) => x.id === it.id);
            if (stored) {
                stored.status = "failed";
                stored.sendError = em;
                stored.updatedAt = new Date().toISOString();
            }
            writeQueue(q);
            failed++;
            results.push({ id: it.id, to: it.to, outcome: "failed", error: em });
        }
    }
    return { wouldSend, results, attempted, sent, failed };
}
async function processApproved() {
    initIfMissing();
    const q = readQueue();
    const eligible = q.items.filter((x) => x.status === "approved" &&
        String(x.tier || "").toUpperCase() === "HOT");
    const maxSend = parseInt(process.env.MAX_SEND || "2", 10);
    const maxCap = Number.isFinite(maxSend) ? maxSend : 2;
    const toSend = eligible.slice(0, maxCap);
    const dryRun = process.env.DRY_RUN === "true";
    const autoSend = process.env.AUTO_SEND === "true";
    const r = await sendQueueSubset(toSend, {
        maxSend: maxCap,
        dryRun,
        autoSend,
        moneyMode: true,
        eligibleHotCount: eligible.length
    });
    return {
        success: true,
        approvedFound: eligible.length,
        attempted: r.attempted,
        sent: r.sent,
        failed: r.failed,
        wouldSend: dryRun ? r.wouldSend : [],
        results: r.results
    };
}
async function processFailedResend() {
    initIfMissing();
    const q = readQueue();
    const failedItems = q.items.filter((x) => x.status === "failed");
    const maxSend = parseInt(process.env.MAX_SEND || "2", 10);
    const dryRun = process.env.DRY_RUN === "true";
    const autoSend = process.env.AUTO_SEND === "true";
    const r = await sendQueueSubset(failedItems, { maxSend, dryRun, autoSend });
    return {
        success: true,
        approvedFound: failedItems.length,
        attempted: r.attempted,
        sent: r.sent,
        failed: r.failed,
        wouldSend: dryRun ? r.wouldSend : [],
        results: r.results
    };
}
/**
 * Send approved rows (AUTO_SEND gate is enforced by the route). Honors DRY_RUN + MAX_SEND.
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendApprovedQueueSubset() {
    initIfMissing();
    const q = readQueue();
    const eligible = q.items.filter((x) => x.status === "approved" &&
        String(x.tier || "").toUpperCase() === "HOT");
    const maxRaw = parseInt(process.env.MAX_SEND || "2", 10);
    const maxSend = Number.isFinite(maxRaw) ? maxRaw : 2;
    const toSend = eligible.slice(0, maxSend);
    const dryRun = process.env.DRY_RUN === "true";
    const r = await sendQueueSubset(toSend, {
        maxSend,
        dryRun,
        autoSend: true,
        moneyMode: true,
        eligibleHotCount: eligible.length
    });
    return {
        sent: r.sent,
        failed: r.failed,
        eligibleHot: eligible.length,
        batchSize: toSend.length
    };
}
function hasPendingFollowupForSource(sourceId) {
    initIfMissing();
    const q = readQueue();
    return q.items.some((x) => x.status === "pending_followup" && x.sourceMessageId === sourceId);
}
function appendFollowupQueueItem(fields) {
    initIfMissing();
    const q = readQueue();
    const now = new Date().toISOString();
    q.items.push({
        id: fields.id,
        customerId: fields.customerId,
        to: fields.to,
        subject: fields.subject,
        text: fields.text,
        status: "pending_followup",
        createdAt: now,
        updatedAt: now,
        sendError: null,
        sourceMessageId: fields.sourceMessageId,
        replied: false
    });
    writeQueue(q);
}
module.exports = {
    queueFilePath,
    initIfMissing,
    appendFromMessages,
    countPending,
    countByStatus,
    getQueueCounts,
    totalQueueItems,
    getItems,
    updateItem,
    processApproved,
    processFailedResend,
    sendApprovedQueueSubset,
    hasPendingFollowupForSource,
    appendFollowupQueueItem
};
