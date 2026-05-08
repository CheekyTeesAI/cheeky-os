"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrdersAwaitingDeposit = getOrdersAwaitingDeposit;
exports.getStaleDepositOrders = getStaleDepositOrders;
exports.buildDepositFollowupsPayload = buildDepositFollowupsPayload;
const client_1 = require("@prisma/client");
const client_2 = require("../db/client");
const EPS = 1e-6;
function round2(n) {
    return Math.round(n * 100) / 100;
}
function depositRequiredForOrder(o) {
    if (o.depositRequired != null && o.depositRequired > 0) {
        return round2(Number(o.depositRequired));
    }
    const total = Number(o.totalAmount) || 0;
    if (total > 0)
        return round2(total * 0.5);
    const q = o.quotedAmount;
    if (q != null && q > 0)
        return round2(q * 0.5);
    return 0;
}
function quoteAnchorDate(o) {
    return o.squareInvoiceSentAt ?? o.createdAt;
}
async function getOrdersAwaitingDeposit() {
    const rows = await client_2.db.order.findMany({
        where: {
            deletedAt: null,
            depositStatus: { not: client_1.OrderDepositStatus.PAID },
            status: { in: ["QUOTE_SENT", "AWAITING_DEPOSIT"] },
        },
        select: {
            id: true,
            customerName: true,
            email: true,
            phone: true,
            totalAmount: true,
            quotedAmount: true,
            depositRequired: true,
            depositPaid: true,
            amountPaid: true,
            status: true,
            squareInvoiceSentAt: true,
            createdAt: true,
        },
    });
    const now = Date.now();
    const out = [];
    for (const o of rows) {
        const depReq = depositRequiredForOrder(o);
        const paid = round2(Number(o.amountPaid) || 0);
        if (depReq > 0 && paid + EPS >= depReq)
            continue;
        const anchor = quoteAnchorDate(o);
        const daysSinceQuote = Math.floor((now - anchor.getTime()) / (24 * 60 * 60 * 1000));
        out.push({
            orderId: o.id,
            customerName: String(o.customerName || "").trim() || "Unknown",
            email: o.email,
            phone: o.phone,
            totalAmount: round2(Number(o.totalAmount) || 0),
            depositRequired: depReq,
            depositPaid: paid,
            daysSinceQuote,
            status: String(o.status),
        });
    }
    return out.sort((a, b) => b.daysSinceQuote - a.daysSinceQuote);
}
async function getStaleDepositOrders(minDays = 2) {
    const all = await getOrdersAwaitingDeposit();
    return all.filter((r) => r.status === "AWAITING_DEPOSIT" && r.daysSinceQuote >= minDays);
}
async function buildDepositFollowupsPayload() {
    const itemsFull = await getOrdersAwaitingDeposit();
    const older2 = itemsFull.filter((i) => i.daysSinceQuote >= 2);
    const count = itemsFull.length;
    const items = itemsFull.map((i) => ({
        orderId: i.orderId,
        customerName: i.customerName,
        depositRequired: i.depositRequired,
        depositPaid: i.depositPaid,
        daysSinceQuote: i.daysSinceQuote,
        status: i.status,
    }));
    let spokenSummary = `You have ${count} order${count === 1 ? "" : "s"} awaiting deposit.`;
    if (older2.length > 0) {
        spokenSummary += ` ${older2.length} ${older2.length === 1 ? "is" : "are"} older than 2 days.`;
    }
    return {
        success: true,
        count,
        items,
        spokenSummary,
    };
}
