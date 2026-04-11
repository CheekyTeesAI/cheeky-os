"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderNotFoundError = void 0;
exports.evaluateOrderById = evaluateOrderById;
const client_1 = require("../db/client");
const financialEngine_1 = require("../lib/financialEngine");
const exceptionReviewService_1 = require("./exceptionReviewService");
const PLACEHOLDER_LABOR_HOURS = 1;
const PLACEHOLDER_BLANK_COST = 0;
class OrderNotFoundError extends Error {
    constructor(orderId) {
        super(`Order not found: ${orderId}`);
        this.name = "OrderNotFoundError";
    }
}
exports.OrderNotFoundError = OrderNotFoundError;
async function evaluateOrderById(orderId) {
    const order = await client_1.db.order.findUnique({ where: { id: orderId } });
    if (!order) {
        throw new OrderNotFoundError(orderId);
    }
    const revenue = order.quotedAmount ?? 0;
    const cost = order.estimatedCost ?? 0;
    const quantity = order.quantity ?? 0;
    const method = order.printMethod ?? "DTG";
    const result = (0, financialEngine_1.evaluateOrder)({
        revenue,
        cost,
        laborHours: PLACEHOLDER_LABOR_HOURS,
        quantity,
        method,
        blankCost: PLACEHOLDER_BLANK_COST,
    });
    const margin = Number.isFinite(result.margin) ? result.margin : null;
    const pph = Number.isFinite(result.pph) ? result.pph : null;
    const blockedReason = result.errors.length > 0 ? result.errors.join("; ") : null;
    const updated = await client_1.db.order.update({
        where: { id: orderId },
        data: {
            margin,
            pph,
            depositRequired: result.depositRequired,
            isApproved: result.approved,
            blockedReason,
            status: result.approved ? "QUOTE_READY" : "BLOCKED",
        },
    });
    if (updated.blockedReason && updated.status === "BLOCKED") {
        (0, exceptionReviewService_1.logExceptionReviewSafe)({
            orderId,
            jobId: null,
            type: "ORDER_EVALUATOR_BLOCKED",
            source: "EVALUATOR",
            severity: "HIGH",
            message: String(updated.blockedReason).slice(0, 2000),
            detailsJson: JSON.stringify({
                margin: updated.margin,
                pph: updated.pph,
                approved: updated.isApproved,
            }),
        });
    }
    return updated;
}
