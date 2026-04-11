"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreOrderForClosing = scoreOrderForClosing;
exports.isEligibleUnpaidQuote = isEligibleUnpaidQuote;
exports.runPaymentClose = runPaymentClose;
exports.registerPaymentCloseInterval = registerPaymentCloseInterval;
const client_1 = require("../db/client");
const estimateSendService_1 = require("./estimateSendService");
const salesAgent_1 = require("./salesAgent");
const revenueLogger_1 = require("./revenueLogger");
const MS_24H = 24 * 60 * 60 * 1000;
const MS_3D = 3 * 24 * 60 * 60 * 1000;
const TOP_N = 8;
function clamp(n) {
    return Math.max(0, Math.min(100, Math.round(n)));
}
function scoreOrderForClosing(order) {
    let score = 0;
    if ((0, estimateSendService_1.hasEstimateBeenDraftedForOrder)(order.id)) {
        score += 30;
    }
    const ageMs = Date.now() - order.createdAt.getTime();
    if (ageMs <= MS_24H) {
        score += 20;
    }
    if (ageMs > MS_3D) {
        score -= 20;
    }
    const lineLen = Array.isArray(order.lineItems)
        ? order.lineItems.length
        : order.lineItems && typeof order.lineItems === "object" && "length" in order.lineItems
            ? order.lineItems.length
            : 0;
    if (lineLen > 0) {
        score += 15;
    }
    const name = order.customer?.name?.trim() ?? "";
    const email = order.customer?.email?.trim() ?? "";
    if (name.length > 0 && email.length > 0) {
        score += 15;
    }
    const taskLen = Array.isArray(order.tasks)
        ? order.tasks.length
        : order.tasks && typeof order.tasks === "object" && "length" in order.tasks
            ? order.tasks.length
            : 0;
    if (taskLen > 0) {
        score += 10;
    }
    if (String(order.status).toUpperCase() === "PAID") {
        score -= 30;
    }
    return clamp(score);
}
function firstName(full) {
    if (!full?.trim())
        return "there";
    return full.trim().split(/\s+/)[0] || "there";
}
function paymentNudgeBody(customerName) {
    const fn = firstName(customerName);
    return `Hey ${fn}, I can get your order into production today. Want me to go ahead and lock this in?`;
}
/** Exported for operator layer — same rule as payment-close targeting. */
function isEligibleUnpaidQuote(order) {
    if (String(order.status).toUpperCase() !== "QUOTE") {
        return false;
    }
    const dep = Number(order.depositAmount ?? 0);
    const tot = Number(order.totalAmount ?? 0);
    const noDepositRecorded = dep === 0;
    const partial = dep < tot;
    return partial || noDepositRecorded;
}
function resolveCloseChannel() {
    const user = String(process.env.OUTREACH_EMAIL ?? "").trim();
    const pass = String(process.env.OUTREACH_PASSWORD ?? "").trim();
    return user && pass ? "email" : "console";
}
async function runPaymentClose() {
    const empty = {
        processed: 0,
        nudged: 0,
        skipped: 0,
        topScores: [],
    };
    try {
        const rows = await client_1.db.order.findMany({
            where: { deletedAt: null },
            include: {
                customer: true,
                lineItems: true,
                tasks: true,
            },
        });
        const eligible = rows.filter((o) => isEligibleUnpaidQuote(o));
        const scored = eligible.map((order) => ({
            order,
            score: scoreOrderForClosing(order),
        }));
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, TOP_N);
        const topScores = top.map((t) => ({
            orderId: t.order.id,
            score: t.score,
        }));
        (0, revenueLogger_1.logRevenueEvent)("PAYMENT_CLOSE_RUN", "batch", `eligible=${eligible.length} top=${top.length}`);
        const channel = resolveCloseChannel();
        const subject = "Ready to lock in your order?";
        let nudged = 0;
        let skipped = 0;
        for (const { order, score } of top) {
            try {
                const email = order.customer?.email?.trim() ?? "";
                if (!email) {
                    skipped += 1;
                    (0, revenueLogger_1.logRevenueEvent)("PAYMENT_SKIPPED", order.id, "no email");
                    continue;
                }
                const body = paymentNudgeBody(order.customer?.name ?? undefined);
                await (0, salesAgent_1.deliverOutboundMessage)(email, subject, body, channel);
                nudged += 1;
                (0, revenueLogger_1.logRevenueEvent)("PAYMENT_NUDGE_SENT", order.id, `score=${score} channel=${channel}`);
            }
            catch (e) {
                skipped += 1;
                (0, revenueLogger_1.logRevenueEvent)("PAYMENT_SKIPPED", order.id, e instanceof Error ? e.message : "send failed");
            }
        }
        return {
            processed: top.length,
            nudged,
            skipped,
            topScores,
        };
    }
    catch (err) {
        console.error("[paymentCloseEngine] runPaymentClose", err);
        (0, revenueLogger_1.logRevenueEvent)("PAYMENT_SKIPPED", "batch", err instanceof Error ? err.message : "fatal");
        return empty;
    }
}
let paymentCloseRegistered = false;
function registerPaymentCloseInterval() {
    if (paymentCloseRegistered)
        return;
    paymentCloseRegistered = true;
    setInterval(() => {
        try {
            void runPaymentClose();
        }
        catch (e) {
            console.error("[paymentCloseEngine] interval", e);
        }
    }, 60 * 60 * 1000);
}
