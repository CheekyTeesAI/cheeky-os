"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyNewIntake = notifyNewIntake;
exports.notifyBlockedOrder = notifyBlockedOrder;
exports.notifyQuoteSent = notifyQuoteSent;
exports.notifyDepositReceived = notifyDepositReceived;
exports.notifyProductionReady = notifyProductionReady;
const client_1 = require("../db/client");
const teamsClient_1 = require("../lib/teamsClient");
function fmtMoney(n) {
    if (n === null || n === undefined || Number.isNaN(n))
        return "—";
    return String(n);
}
function fmtNum(n) {
    if (n === null || n === undefined || Number.isNaN(n))
        return "—";
    return String(n);
}
function wrapTeamsCall(fn) {
    return fn()
        .then(() => ({ success: true }))
        .catch((e) => ({
        success: false,
        error: e instanceof Error ? e.message : String(e),
    }));
}
async function notifyNewIntake(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
    if (!order) {
        return { success: false, error: `Order not found: ${orderId}` };
    }
    const text = [
        "📥 New Intake",
        `Customer: ${order.customerName}`,
        `Email: ${order.email}`,
        `Order ID: ${order.id}`,
        `Status: ${order.status}`,
    ].join("\n");
    return wrapTeamsCall(() => (0, teamsClient_1.sendTeamsWebhookMessage)(text));
}
async function notifyBlockedOrder(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
    if (!order) {
        return { success: false, error: `Order not found: ${orderId}` };
    }
    const text = [
        "⛔ Order Blocked",
        `Customer: ${order.customerName}`,
        `Order ID: ${order.id}`,
        `Reason: ${order.blockedReason ?? "—"}`,
        `Quoted Amount: ${fmtMoney(order.quotedAmount)}`,
        `Margin: ${fmtNum(order.margin)}`,
        `PPH: ${fmtNum(order.pph)}`,
    ].join("\n");
    return wrapTeamsCall(() => (0, teamsClient_1.sendTeamsWebhookMessage)(text));
}
async function notifyQuoteSent(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
    if (!order) {
        return { success: false, error: `Order not found: ${orderId}` };
    }
    const text = [
        "📧 Quote / invoice sent",
        `Customer: ${order.customerName}`,
        `Order ID: ${order.id}`,
        `Square invoice: ${order.squareInvoiceNumber ?? order.squareInvoiceId ?? "—"}`,
        `Status: ${order.status}`,
    ].join("\n");
    return wrapTeamsCall(() => (0, teamsClient_1.sendTeamsWebhookMessage)(text));
}
async function notifyDepositReceived(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
    if (!order) {
        return { success: false, error: `Order not found: ${orderId}` };
    }
    const text = [
        "💰 Deposit Received",
        `Customer: ${order.customerName}`,
        `Order ID: ${order.id}`,
        `Deposit Required: ${fmtMoney(order.depositRequired)}`,
        `Amount Paid: ${fmtMoney(order.amountPaid)}`,
        `Status: ${order.status}`,
    ].join("\n");
    return wrapTeamsCall(() => (0, teamsClient_1.sendTeamsWebhookMessage)(text));
}
async function notifyProductionReady(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
    if (!order) {
        return { success: false, error: `Order not found: ${orderId}` };
    }
    const productionType = order.printMethod ?? "—";
    const text = [
        "🏭 Production Ready",
        `Customer: ${order.customerName}`,
        `Order ID: ${order.id}`,
        `Production Type: ${productionType}`,
        `Status: ${order.status}`,
    ].join("\n");
    return wrapTeamsCall(() => (0, teamsClient_1.sendTeamsWebhookMessage)(text));
}
