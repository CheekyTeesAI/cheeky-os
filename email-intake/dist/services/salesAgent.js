"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverOutboundMessage = deliverOutboundMessage;
exports.generateSalesMessage = generateSalesMessage;
exports.runSalesAgentForOrder = runSalesAgentForOrder;
const client_1 = require("../db/client");
const revenueLogger_1 = require("./revenueLogger");
function firstName(full) {
    if (!full || !full.trim())
        return "there";
    const parts = full.trim().split(/\s+/);
    return parts[0] || "there";
}
function templateForStatus(status, customerName) {
    const fn = firstName(customerName);
    const st = status.toUpperCase();
    if (st === "QUOTE") {
        return {
            messageType: "QUOTE_CONVERSION",
            subject: "Your Cheeky order is ready to move",
            body: `Hey ${fn}, I've got this ready to move. Want me to get it into production for you today?`,
        };
    }
    if (st === "NEEDS_REVIEW") {
        return {
            messageType: "NEEDS_REVIEW_CLARIFY",
            subject: "Quick question about your order",
            body: `Hey ${fn}, I just need a quick confirmation on a few order details before I move forward.`,
        };
    }
    return {
        messageType: "REVIEW_FALLBACK",
        subject: "Cheeky order follow-up",
        body: `Hey ${fn}, thanks for your order — we're reviewing the details and will follow up shortly.`,
    };
}
async function refineWithOptionalLLM(baseBody, customerName) {
    const key = String(process.env.OPENAI_API_KEY ?? "").trim();
    if (!key)
        return baseBody;
    const fn = firstName(customerName);
    try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "Generate a short friendly sales follow-up for a custom apparel order. Keep it under 60 words. No fluff. Ask for one clear next step. Use the customer's first name if provided.",
                    },
                    {
                        role: "user",
                        content: `Customer first name: ${fn}\n\nDraft to refine:\n${baseBody}`,
                    },
                ],
                max_tokens: 200,
                temperature: 0.4,
            }),
        });
        if (!res.ok)
            return baseBody;
        const data = (await res.json());
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 0)
            return text;
    }
    catch {
        /* fallback below */
    }
    return baseBody;
}
/** Shared outbound path (console default; email when configured). */
async function deliverOutboundMessage(toEmail, subject, body, channel) {
    if (channel === "email") {
        const user = String(process.env.OUTREACH_EMAIL ?? "").trim();
        const pass = String(process.env.OUTREACH_PASSWORD ?? "").trim();
        if (user && pass && toEmail) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-require-imports
                const nodemailer = require("nodemailer");
                const transporter = nodemailer.createTransport({
                    host: "smtp.office365.com",
                    port: 587,
                    secure: false,
                    auth: { user, pass },
                });
                await transporter.sendMail({
                    from: `"Cheeky" <${user}>`,
                    to: toEmail,
                    subject,
                    text: body,
                });
                return { sendMode: "email", sent: true };
            }
            catch {
                console.log(`[SALES] console fallback (email failed) → ${toEmail}`);
                console.log(`[SALES] ${subject}\n${body}`);
                return { sendMode: "console", sent: true };
            }
        }
    }
    console.log(`[SALES] → ${toEmail || "(no-email)"} → ${subject} — ${body.slice(0, 120)}...`);
    return { sendMode: "console", sent: true };
}
async function generateSalesMessage(orderId, options = {}) {
    const order = await client_1.db.order.findFirst({
        where: { id: orderId, deletedAt: null },
        include: {
            customer: true,
            lineItems: true,
            tasks: true,
        },
    });
    if (!order) {
        throw new Error("Order not found");
    }
    const status = String(order.status);
    const customerId = order.customerId;
    const email = order.customer?.email?.trim() ?? "";
    if (status.toUpperCase() === "PAID" && !options.force) {
        (0, revenueLogger_1.logRevenueEvent)("SALES_AGENT_SKIPPED", orderId, "PAID — no sell");
        return {
            orderId,
            customerId,
            status,
            messageType: "SKIPPED_PAID",
            subject: "",
            body: "",
            sendMode: "none",
            sent: false,
            skipped: true,
        };
    }
    let { messageType, subject, body } = templateForStatus(status, order.customer?.name);
    try {
        body = await refineWithOptionalLLM(body, order.customer?.name);
    }
    catch {
        /* keep template */
    }
    (0, revenueLogger_1.logRevenueEvent)("SALES_MESSAGE_GENERATED", orderId, `${messageType} reason=${options.reason ?? "manual"}`);
    return {
        orderId,
        customerId,
        status,
        messageType,
        subject,
        body,
        sendMode: "none",
        sent: false,
        skipped: false,
    };
}
async function runSalesAgentForOrder(orderId, options = {}) {
    try {
        const generated = await generateSalesMessage(orderId, options);
        if (generated.skipped) {
            return generated;
        }
        const autoSend = options.autoSend === true;
        const channel = options.channel ?? "console";
        if (!autoSend) {
            return { ...generated, sendMode: "none", sent: false };
        }
        const order = await client_1.db.order.findFirst({
            where: { id: orderId },
            include: { customer: true },
        });
        const toEmail = order?.customer?.email?.trim() ?? "";
        const { sendMode, sent } = await deliverOutboundMessage(toEmail, generated.subject, generated.body, channel);
        (0, revenueLogger_1.logRevenueEvent)("SALES_AGENT_SENT", orderId, `mode=${sendMode} channel=${channel}`);
        return {
            ...generated,
            sendMode,
            sent,
            skipped: false,
        };
    }
    catch (err) {
        console.error("[salesAgent] runSalesAgentForOrder", err);
        (0, revenueLogger_1.logRevenueEvent)("SALES_AGENT_SKIPPED", orderId, err instanceof Error ? err.message : "error");
        return {
            orderId,
            customerId: "",
            status: "",
            messageType: "ERROR",
            subject: "",
            body: "",
            sendMode: "none",
            sent: false,
            skipped: true,
        };
    }
}
