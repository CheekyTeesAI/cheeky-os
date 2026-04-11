"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createExceptionReview = createExceptionReview;
exports.logExceptionReviewSafe = logExceptionReviewSafe;
exports.resolveExceptionReview = resolveExceptionReview;
exports.getOpenExceptions = getOpenExceptions;
const client_1 = require("../db/client");
const logger_1 = require("../utils/logger");
async function createExceptionReview(input) {
    const message = String(input.message ?? "").slice(0, 4000);
    return client_1.db.exceptionReview.create({
        data: {
            orderId: input.orderId ?? null,
            jobId: input.jobId ?? null,
            type: input.type,
            source: input.source,
            severity: input.severity,
            message,
            detailsJson: input.detailsJson ?? null,
        },
    });
}
/** Fire-and-forget; never throws to callers. */
function logExceptionReviewSafe(input) {
    void createExceptionReview(input).catch((e) => {
        const m = e instanceof Error ? e.message : String(e);
        logger_1.logger.warn(`exceptionReviewService: failed to record exception: ${m}`);
    });
}
async function resolveExceptionReview(id, resolvedBy) {
    const row = await client_1.db.exceptionReview.findUnique({ where: { id } });
    if (!row) {
        throw new Error(`ExceptionReview not found: ${id}`);
    }
    if (row.resolved) {
        return row;
    }
    return client_1.db.exceptionReview.update({
        where: { id },
        data: {
            resolved: true,
            resolvedAt: new Date(),
            resolvedBy: String(resolvedBy ?? "").trim() || "unknown",
        },
    });
}
async function getOpenExceptions() {
    return client_1.db.exceptionReview.findMany({
        where: { resolved: false },
        orderBy: { createdAt: "desc" },
    });
}
