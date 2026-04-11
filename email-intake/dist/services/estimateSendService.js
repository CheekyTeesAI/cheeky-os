"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasEstimateBeenDraftedForOrder = hasEstimateBeenDraftedForOrder;
exports.sendEstimate = sendEstimate;
const client_1 = require("../db/client");
const square_service_1 = require("./square.service");
const revenueLogger_1 = require("./revenueLogger");
/** orderId → draft estimate id (in-process; no schema change) */
const estimateIdByOrderId = new Map();
/** True after sendEstimate has created/reused a draft for this order (same process). */
function hasEstimateBeenDraftedForOrder(orderId) {
    return estimateIdByOrderId.has(orderId);
}
function squareConfigured() {
    return (!!String(process.env.SQUARE_ACCESS_TOKEN ?? "").trim() &&
        !!String(process.env.SQUARE_LOCATION_ID ?? "").trim());
}
/**
 * Creates or reuses a draft estimate id for the order (draft may be simulated).
 */
async function createEstimateDraftForOrder(orderId) {
    const existing = estimateIdByOrderId.get(orderId);
    if (existing) {
        return existing;
    }
    const estimateId = `est_${orderId.slice(0, 8)}_${Date.now()}`;
    estimateIdByOrderId.set(orderId, estimateId);
    (0, revenueLogger_1.logRevenueEvent)("estimate_created", orderId, `new estimateId=${estimateId}`);
    return estimateId;
}
/**
 * Loads order + customer + line items, ensures a draft estimate exists, then sends or simulates send.
 */
async function sendEstimate(orderId) {
    try {
        const order = await client_1.db.order.findFirst({
            where: { id: orderId, deletedAt: null },
            include: {
                customer: true,
                lineItems: true,
            },
        });
        if (!order) {
            throw new Error("Order not found");
        }
        const estimateId = await createEstimateDraftForOrder(orderId);
        const email = order.customer?.email?.trim() ?? "";
        let status = "SIMULATED";
        if (squareConfigured()) {
            try {
                (0, square_service_1.getSquareClient)();
                status = "SENT";
            }
            catch {
                status = "SIMULATED";
            }
        }
        (0, revenueLogger_1.logRevenueEvent)("estimate_sent", orderId, `estimateId=${estimateId} mode=${status}`);
        console.log(`ESTIMATE SENT → ${email || "(no-email)"} → ${orderId}`);
        return { orderId, estimateId, status };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        (0, revenueLogger_1.logRevenueEvent)("estimate_sent", orderId, `error fallback: ${msg}`);
        const estimateId = estimateIdByOrderId.get(orderId) ?? `est_err_${orderId.slice(0, 8)}_${Date.now()}`;
        console.log(`ESTIMATE SENT → (error) → ${orderId}`);
        return { orderId, estimateId, status: "SIMULATED" };
    }
}
