"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processManualReviewResolve = processManualReviewResolve;
const client_1 = require("../db/client");
const exceptionReviewService_1 = require("./exceptionReviewService");
const sharepointOrderSync_1 = require("./sharepointOrderSync");
const logger_1 = require("../utils/logger");
async function processManualReviewResolve(input) {
    const exId = String(input.exceptionReviewId ?? "").trim();
    const resolvedBy = String(input.resolvedBy ?? "").trim();
    if (!exId) {
        throw new Error("exceptionReviewId is required");
    }
    if (!resolvedBy) {
        throw new Error("resolvedBy is required");
    }
    await (0, exceptionReviewService_1.resolveExceptionReview)(exId, resolvedBy);
    if (input.orderOverride) {
        const { orderId, reason, by, clearBlockedReason } = input.orderOverride;
        const oid = String(orderId ?? "").trim();
        if (!oid) {
            throw new Error("orderOverride.orderId is required");
        }
        const now = new Date();
        await client_1.db.order.update({
            where: { id: oid },
            data: {
                manualOverride: true,
                manualOverrideReason: String(reason ?? "").trim() || null,
                manualOverrideBy: String(by ?? "").trim() || null,
                manualOverrideAt: now,
                ...(clearBlockedReason
                    ? {
                        blockedReason: null,
                        status: "QUOTE_READY",
                    }
                    : {}),
            },
        });
        try {
            await (0, sharepointOrderSync_1.syncOrderToSharePoint)(oid);
        }
        catch (spErr) {
            const spMsg = spErr instanceof Error ? spErr.message : String(spErr);
            logger_1.logger.warn(`manualReviewService: SharePoint sync failed for ${oid}: ${spMsg}`);
        }
    }
    return { success: true, exceptionReviewId: exId };
}
