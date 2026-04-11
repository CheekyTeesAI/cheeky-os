"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const jarvisSquareService_1 = require("../services/jarvisSquareService");
const MS_DAY = 24 * 60 * 60 * 1000;
const roundPrice = (price) => {
    if (price < 20)
        return Math.round(price * 2) / 2;
    if (price < 30)
        return Math.round(price * 2) / 2;
    return Math.ceil(price);
};
function invoiceMoneyToTotal(m) {
    if (!m || typeof m !== "object")
        return null;
    const amt = m.amount;
    if (typeof amt === "bigint")
        return Number(amt) / 100;
    if (typeof amt === "number")
        return amt / 100;
    return null;
}
function invoiceCustomerName(inv) {
    const title = String(inv.title ?? "").trim();
    const m = title.match(/^estimate\s*[—-]\s*(.+)$/i);
    return m ? m[1].trim() : title || "Customer";
}
function parseEstimateText(text) {
    const t = text.trim();
    if (!t)
        return { ok: false };
    const qtyMatch = t.match(/\d+/);
    if (!qtyMatch)
        return { ok: false };
    const quantity = Number(qtyMatch[0]);
    if (!Number.isFinite(quantity) || quantity < 1)
        return { ok: false };
    let printColors = 1;
    const colorMatch = t.match(/\b(\d+)\s*colors?\b/i);
    if (colorMatch) {
        const n = Number(colorMatch[1]);
        if (Number.isFinite(n) && n >= 1)
            printColors = Math.floor(n);
    }
    const isSchool = /\bschool\b/i.test(t) || /\bnonprofit\b/i.test(t);
    const garmentType = /\bdark\b/i.test(t) ? "dark" : "light";
    return { ok: true, quantity, printColors, isSchool, garmentType };
}
async function handleOperatorCommand(input) {
    try {
        const { command, data } = input;
        if (command === undefined ||
            command === null ||
            (typeof command === "string" && command.trim() === "")) {
            return { ok: false, status: 400, error: "Missing command" };
        }
        let result;
        switch (command) {
            case "create_estimate": {
                const d = typeof data === "object" && data !== null
                    ? data
                    : {};
                if (d.confirm !== true) {
                    return { ok: false, status: 400, error: "Confirmation required" };
                }
                let work = { ...d };
                const textRaw = d.text;
                if (typeof textRaw === "string" && textRaw.trim()) {
                    const parsed = parseEstimateText(textRaw);
                    if (!parsed.ok) {
                        return { ok: false, status: 400, error: "Could not parse input" };
                    }
                    work = {
                        ...work,
                        quantity: parsed.quantity,
                        printColors: parsed.printColors,
                        isSchool: parsed.isSchool,
                        garmentType: parsed.garmentType
                    };
                }
                const lineItems = Array.isArray(work.lineItems)
                    ? work.lineItems
                    : [];
                const first = lineItems[0] || {};
                const customerName = String(work.customerName ??
                    work.customer?.name ??
                    "").trim();
                const qtyRaw = Number(first.quantity ?? work.quantity ?? 1);
                const qty = qtyRaw >= 1 ? qtyRaw : 1;
                let effColors = Number(work.printColors);
                if (!Number.isFinite(effColors) || effColors < 1)
                    effColors = 1;
                const garment = String(work.garmentType ?? "light").toLowerCase();
                if (garment === "dark")
                    effColors += 1;
                const shirtCost = 3.15;
                const overhead = 1.0;
                let basePrint = 2.85;
                if (qty >= 500)
                    basePrint = 1.45;
                else if (qty >= 250)
                    basePrint = 1.65;
                else if (qty >= 144)
                    basePrint = 1.85;
                else if (qty >= 72)
                    basePrint = 2.05;
                else if (qty >= 24)
                    basePrint = 2.35;
                const printCost = basePrint * effColors;
                const trueCost = shirtCost + printCost + overhead;
                const tpRaw = work.targetProfit;
                const profitMode = tpRaw !== undefined &&
                    tpRaw !== null &&
                    tpRaw !== "" &&
                    Number.isFinite(Number(tpRaw));
                let unitPrice;
                let pricingMode;
                if (profitMode) {
                    const targetProfit = Number(tpRaw);
                    const profitPerUnit = targetProfit / qty;
                    unitPrice = Math.ceil((trueCost + profitPerUnit) * 100) / 100;
                    pricingMode = "profit";
                }
                else {
                    let marginUsed = qty < 24 ? 0.7 : qty < 72 ? 0.6 : qty < 144 ? 0.55 : qty < 250 ? 0.5 : qty < 500 ? 0.45 : 0.4;
                    if (work.isSchool === true) {
                        marginUsed -= 0.05;
                        if (marginUsed < 0.4)
                            marginUsed = 0.4;
                    }
                    unitPrice = Math.ceil(trueCost / (1 - marginUsed));
                    pricingMode = "margin";
                }
                unitPrice = roundPrice(unitPrice);
                let outputMode = pricingMode;
                const actualMargin = unitPrice > 0 ? (unitPrice - trueCost) / unitPrice : 0;
                if (actualMargin < 0.4) {
                    unitPrice = Math.ceil(trueCost / (1 - 0.4));
                    outputMode = "guardrail_adjusted";
                }
                try {
                    const created = await (0, jarvisSquareService_1.createDraftEstimate)({
                        customerName,
                        quantity: qty,
                        unitPrice
                    });
                    const margin = unitPrice > 0 ? (unitPrice - trueCost) / unitPrice : 0;
                    result = {
                        estimateId: created.invoiceId,
                        unitPrice,
                        totalRevenue: unitPrice * qty,
                        totalCost: trueCost * qty,
                        profit: (unitPrice - trueCost) * qty,
                        margin,
                        mode: outputMode
                    };
                    const discRaw = work.discountPercent;
                    if (discRaw !== undefined &&
                        discRaw !== null &&
                        discRaw !== "" &&
                        Number.isFinite(Number(discRaw))) {
                        const discount = Number(discRaw) / 100;
                        const discountedUnitPrice = Math.round(unitPrice * (1 - discount) * 100) / 100;
                        result = {
                            ...(typeof result === "object" && result !== null ? result : {}),
                            discountedUnitPrice
                        };
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return { ok: false, status: 500, error: message };
                }
                break;
            }
            case "create_invoice": {
                const invData = typeof data === "object" && data !== null
                    ? data
                    : {};
                if (invData.confirm !== true) {
                    return { ok: false, status: 400, error: "Confirmation required" };
                }
                result = { invoiceId: "temp_456" };
                break;
            }
            case "what_needs_printing":
                result = {
                    jobs: [
                        {
                            orderId: "123",
                            customer: "SDPC",
                            status: "ready"
                        }
                    ]
                };
                break;
            case "follow_up_estimates": {
                try {
                    const fuData = typeof data === "object" && data !== null
                        ? data
                        : {};
                    const sendSim = fuData.send === true;
                    if (sendSim &&
                        fuData.confirm !== true) {
                        return { ok: false, status: 400, error: "Confirmation required" };
                    }
                    const raw = await (0, jarvisSquareService_1.listDraftInvoicesForFollowup)();
                    const now = Date.now();
                    const daysSince = (createdMs) => Math.floor((now - createdMs) / MS_DAY);
                    const scorePriority = (ageDays, totalAmt) => {
                        let priority = 0;
                        if (ageDays >= 3)
                            priority += 1;
                        if (ageDays >= 7)
                            priority += 2;
                        if (ageDays >= 10)
                            priority += 3;
                        if (totalAmt > 500)
                            priority += 2;
                        if (totalAmt > 1000)
                            priority += 3;
                        return priority;
                    };
                    const messageForPriority = (p, name) => {
                        const low = "Hey " +
                            name +
                            ", just checking in on your order — let me know if you'd like to move forward!";
                        const medium = "Hey " +
                            name +
                            ", just following up on your shirts — we've got availability this week if you want to get started.";
                        const high = "Hey " +
                            name +
                            ", just wanted to check one last time on your order — we can get this into production right away if you're ready.";
                        if (p >= 5)
                            return high;
                        if (p >= 3)
                            return medium;
                        return low;
                    };
                    const recipientEmail = (inv) => {
                        const pick = (o) => {
                            if (!o || typeof o !== "object")
                                return "";
                            const r = o;
                            const e = r.emailAddress ?? r.email_address ?? r.email;
                            return typeof e === "string" ? e.trim() : "";
                        };
                        let s = pick(inv.primaryRecipient);
                        if (s)
                            return s;
                        s = pick(inv.customer);
                        if (s)
                            return s;
                        return "";
                    };
                    const rows = raw
                        .map((inv) => (inv && typeof inv === "object" ? inv : null))
                        .filter((inv) => inv !== null)
                        .filter((inv) => {
                        const st = String(inv.status ?? "").toUpperCase();
                        if (st === "PAID" || st === "COMPLETED")
                            return false;
                        const createdAt = inv.createdAt ?? inv.updatedAt;
                        const t = createdAt ? new Date(String(createdAt)).getTime() : NaN;
                        return Number.isFinite(t);
                    })
                        .map((inv) => {
                        const customerName = invoiceCustomerName(inv);
                        const total = invoiceMoneyToTotal(inv.computedAmountMoney) ??
                            invoiceMoneyToTotal(inv.documentAmountMoney) ??
                            invoiceMoneyToTotal(inv.publicAmountMoney) ??
                            0;
                        const createdAt = inv.createdAt ?? inv.updatedAt;
                        const createdMs = new Date(String(createdAt)).getTime();
                        const ageDays = daysSince(createdMs);
                        const priority = scorePriority(ageDays, total);
                        const message = messageForPriority(priority, customerName);
                        const addr = recipientEmail(inv);
                        return {
                            id: String(inv.id ?? ""),
                            customerName,
                            total,
                            priority,
                            message,
                            email: addr || undefined,
                            customerEmail: addr || undefined
                        };
                    });
                    const totalOpenValue = rows.reduce((s, r) => s + r.total, 0);
                    const totalCount = rows.length;
                    const highPriorityCount = rows.filter((r) => r.priority >= 5).length;
                    const sorted = [...rows].sort((a, b) => {
                        if (b.priority !== a.priority)
                            return b.priority - a.priority;
                        return b.total - a.total;
                    });
                    const estimates = [];
                    for (const est of sorted) {
                        let sent = false;
                        let sentAt = null;
                        let error;
                        if (sendSim) {
                            const eRow = est;
                            const message = eRow.message;
                            const customerEmail = eRow.email || eRow.customerEmail;
                            if (!customerEmail) {
                                sent = false;
                                error = "No email";
                            }
                            else {
                                try {
                                    const response = await fetch("https://api.resend.com/emails", {
                                        method: "POST",
                                        headers: {
                                            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
                                            "Content-Type": "application/json"
                                        },
                                        body: JSON.stringify({
                                            from: "Cheeky Tees <onboarding@resend.dev>",
                                            to: ["customer.service@cheekyteesllc.com"],
                                            subject: "Quick follow-up on your order",
                                            html: `<p>${message}</p>`
                                        })
                                    });
                                    const text = await response.text();
                                    if (response.ok) {
                                        sent = true;
                                        sentAt = new Date().toISOString();
                                    }
                                    else {
                                        sent = false;
                                        error = `Resend error: ${text}`;
                                    }
                                }
                                catch (err) {
                                    sent = false;
                                    error =
                                        err instanceof Error ? err.message : String(err);
                                }
                            }
                        }
                        estimates.push({
                            ...est,
                            sent,
                            sentAt,
                            ...(error !== undefined ? { error } : {})
                        });
                    }
                    result = {
                        summary: {
                            totalOpenValue,
                            totalCount,
                            highPriorityCount
                        },
                        estimates
                    };
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return { ok: false, status: 500, error: message };
                }
                break;
            }
            default:
                return { ok: false, status: 400, error: "Invalid command" };
        }
        return { ok: true, result };
    }
    catch (err) {
        return {
            ok: false,
            status: 500,
            error: err instanceof Error ? err.message : "Unknown error"
        };
    }
}
const router = express_1.default.Router();
router.post("/execute", async (req, res) => {
    try {
        const { command, data } = req.body ?? {};
        const out = await handleOperatorCommand({ command, data });
        if (out.ok === false) {
            return res.status(out.status).json({
                success: false,
                error: out.error
            });
        }
        return res.json({
            success: true,
            result: out.result
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "Server error"
        });
    }
});
router.get("/test-followup", async (_req, res) => {
    try {
        const out = await handleOperatorCommand({
            command: "follow_up_estimates",
            data: { send: true, confirm: true }
        });
        if (out.ok === false) {
            return res.status(out.status).json({
                success: false,
                error: out.error
            });
        }
        return res.json({
            success: true,
            result: out.result
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "Server error"
        });
    }
});
exports.default = router;
