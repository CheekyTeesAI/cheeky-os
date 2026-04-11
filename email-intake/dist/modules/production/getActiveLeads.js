"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActiveLeads = getActiveLeads;
const squareEstimate_service_1 = require("../command-layer/services/squareEstimate.service");
function toIso(value) {
    const raw = String(value ?? "").trim();
    if (!raw)
        return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
function toName(value) {
    const s = String(value ?? "").trim();
    return s || "Customer";
}
async function getActiveLeads() {
    try {
        const [estimatesRes, invoicesRes] = await Promise.all([
            (0, squareEstimate_service_1.getRecentEstimates)(),
            (0, squareEstimate_service_1.getRecentInvoices)()
        ]);
        const estimateLeads = (estimatesRes.data || []).map((row) => {
            const r = row;
            return {
                id: `est-${String(r.id ?? "")}`,
                customerName: toName(r.customerId),
                value: typeof r.amount === "number" ? r.amount : 0,
                stage: "Estimate Sent",
                lastActivityDate: toIso(r.createdAt)
            };
        });
        const invoiceFollowups = (invoicesRes.data || [])
            .filter((row) => String(row.status ?? "").toUpperCase() !== "PAID")
            .map((row) => {
            const r = row;
            return {
                id: `inv-${String(r.id ?? "")}`,
                customerName: toName(r.customerId),
                value: typeof r.amount === "number" ? r.amount : 0,
                stage: "Follow-Up",
                lastActivityDate: toIso(r.createdAt)
            };
        });
        return Array.from(new Map([...estimateLeads, ...invoiceFollowups].map((l) => [l.id, l])).values());
    }
    catch {
        return [];
    }
}
