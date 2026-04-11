"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SquareEstimateServicePlaceholder = void 0;
exports.getRecentCustomers = getRecentCustomers;
exports.getRecentInvoices = getRecentInvoices;
exports.getRecentEstimates = getRecentEstimates;
const square_1 = require("square");
const square_service_1 = require("../../../services/square.service");
function mapSquareError(step, err) {
    if (err instanceof square_1.ApiError) {
        const detail = err.errors?.map((e) => e.detail || e.code).join("; ") || err.message;
        return new Error(`Square ${step}: ${detail}`);
    }
    return err instanceof Error ? err : new Error(String(err));
}
function moneyAmount(value) {
    if (!value || typeof value !== "object")
        return 0;
    const amount = value.amount;
    if (typeof amount === "bigint")
        return Number(amount) / 100;
    if (typeof amount === "number")
        return amount / 100;
    return 0;
}
function mapInvoice(inv) {
    return {
        id: String(inv.id ?? ""),
        customerId: String(inv.primaryRecipientCustomerId ?? ""),
        amount: moneyAmount(inv.computedAmountMoney) ||
            moneyAmount(inv.publicAmountMoney) ||
            moneyAmount(inv.invoiceAmountMoney) ||
            moneyAmount(inv.documentAmountMoney),
        status: String(inv.status ?? ""),
        createdAt: String(inv.createdAt ?? "")
    };
}
async function readAllCustomers(client) {
    const all = [];
    const seen = new Set();
    let cursor;
    while (true) {
        const res = await client.customersApi.searchCustomers({
            limit: BigInt(100),
            cursor
        });
        const page = (res.result?.customers || []);
        all.push(...page);
        const next = res.result?.cursor;
        const nextCursor = typeof next === "string" && next.trim() ? next : undefined;
        if (!nextCursor || seen.has(nextCursor))
            break;
        seen.add(nextCursor);
        cursor = nextCursor;
    }
    return all;
}
async function readAllInvoices(client, locationId) {
    const all = [];
    const seen = new Set();
    let cursor;
    while (true) {
        const res = await client.invoicesApi.searchInvoices({
            query: {
                filter: {
                    locationIds: [locationId]
                },
                sort: {
                    field: "INVOICE_SORT_DATE",
                    order: "DESC"
                }
            },
            limit: 200,
            cursor
        });
        const page = (res.result?.invoices || []);
        all.push(...page);
        const next = res.result?.cursor;
        const nextCursor = typeof next === "string" && next.trim() ? next : undefined;
        if (!nextCursor || seen.has(nextCursor))
            break;
        seen.add(nextCursor);
        cursor = nextCursor;
    }
    return all;
}
async function getRecentCustomers() {
    const client = (0, square_service_1.getSquareClient)();
    try {
        const customers = await readAllCustomers(client);
        const data = customers.map((c) => ({
            id: String(c.id ?? ""),
            name: String(c.givenName || c.familyName
                ? `${c.givenName || ""} ${c.familyName || ""}`.trim()
                : c.nickname || ""),
            email: String(c.emailAddress ?? ""),
            phone: String(c.phoneNumber ?? ""),
            company: String(c.companyName ?? "")
        }));
        return { success: true, data };
    }
    catch (err) {
        throw mapSquareError("getRecentCustomers", err);
    }
}
async function getRecentInvoices() {
    const client = (0, square_service_1.getSquareClient)();
    const locationId = await (0, square_service_1.resolveSquareLocationId)(client);
    try {
        const invoices = (await readAllInvoices(client, locationId)).map((inv) => mapInvoice(inv));
        return { success: true, data: invoices };
    }
    catch (err) {
        throw mapSquareError("getRecentInvoices", err);
    }
}
async function getRecentEstimates() {
    const client = (0, square_service_1.getSquareClient)();
    const locationId = await (0, square_service_1.resolveSquareLocationId)(client);
    try {
        const invoices = (await readAllInvoices(client, locationId))
            .filter((inv) => {
            const status = String(inv.status ?? "").toUpperCase();
            const title = String(inv.title ?? "").toLowerCase();
            return status === "DRAFT" || title.startsWith("estimate");
        })
            .map((inv) => mapInvoice(inv));
        return { success: true, data: invoices };
    }
    catch (err) {
        throw mapSquareError("getRecentEstimates", err);
    }
}
class SquareEstimateServicePlaceholder {
    async getRecentCustomers() {
        return getRecentCustomers();
    }
    async getRecentInvoices() {
        return getRecentInvoices();
    }
    async getRecentEstimates() {
        return getRecentEstimates();
    }
}
exports.SquareEstimateServicePlaceholder = SquareEstimateServicePlaceholder;
