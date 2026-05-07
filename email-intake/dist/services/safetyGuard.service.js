"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionNotAllowedError = void 0;
exports.evaluateOperationSafety = evaluateOperationSafety;
exports.evaluateActionSafety = evaluateActionSafety;
exports.assertActionAllowed = assertActionAllowed;
const exceptionReviewService_1 = require("./exceptionReviewService");
const MAX_OPERATION_DEPTH = 12;
const MAX_OPERATION_ITERATIONS = 100;
const MAX_OPERATION_RETRIES = 8;
const MAX_DATA_LIMIT = 1000;
const FORBIDDEN_OPERATION_TOKENS = [
    "fullscan",
    "bulkexport",
    "recursivesync",
    "rebuildall",
    "backfillall",
];
function normalizeOperationKey(op) {
    return String(op ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}
/**
 * Deterministic guard for loops, oversized pulls, and known heavy operation labels.
 * Does not replace domain checks in `evaluateActionSafety`.
 */
function evaluateOperationSafety(intent) {
    const key = normalizeOperationKey(intent.operation);
    for (const token of FORBIDDEN_OPERATION_TOKENS) {
        if (key.includes(token)) {
            return {
                allowed: false,
                reason: `Blocked heavy or dangerous operation label (matched: ${token})`,
            };
        }
    }
    if (intent.depth !== undefined) {
        if (!Number.isFinite(intent.depth) ||
            intent.depth < 0 ||
            intent.depth > MAX_OPERATION_DEPTH) {
            return {
                allowed: false,
                reason: `depth must be a finite number from 0 to ${MAX_OPERATION_DEPTH}`,
            };
        }
    }
    if (intent.iterationCount !== undefined) {
        if (!Number.isFinite(intent.iterationCount) ||
            intent.iterationCount < 0 ||
            intent.iterationCount > MAX_OPERATION_ITERATIONS) {
            return {
                allowed: false,
                reason: `iterationCount must be a finite number from 0 to ${MAX_OPERATION_ITERATIONS}`,
            };
        }
    }
    if (intent.retryCount !== undefined) {
        if (!Number.isFinite(intent.retryCount) ||
            intent.retryCount < 0 ||
            intent.retryCount > MAX_OPERATION_RETRIES) {
            return {
                allowed: false,
                reason: `retryCount must be a finite number from 0 to ${MAX_OPERATION_RETRIES}`,
            };
        }
    }
    if (intent.requestedLimit !== undefined) {
        if (!Number.isFinite(intent.requestedLimit) ||
            intent.requestedLimit < 0 ||
            intent.requestedLimit > MAX_DATA_LIMIT) {
            return {
                allowed: false,
                reason: `requestedLimit must be a finite number from 0 to ${MAX_DATA_LIMIT}`,
            };
        }
    }
    if (intent.pageSize !== undefined) {
        if (!Number.isFinite(intent.pageSize) ||
            intent.pageSize < 0 ||
            intent.pageSize > MAX_DATA_LIMIT) {
            return {
                allowed: false,
                reason: `pageSize must be a finite number from 0 to ${MAX_DATA_LIMIT}`,
            };
        }
    }
    if (intent.requireExplicitLimit === true) {
        if (intent.requestedLimit === undefined ||
            !Number.isFinite(intent.requestedLimit)) {
            return {
                allowed: false,
                reason: "requestedLimit is required for this collection operation",
            };
        }
    }
    return { allowed: true };
}
/*
Example (Express route):
  const gate = evaluateOperationSafety({
    operation: String(req.query.op ?? "list"),
    requestedLimit: req.query.limit != null ? Number(req.query.limit) : undefined,
    pageSize: req.query.pageSize != null ? Number(req.query.pageSize) : undefined,
  });
  if (!gate.allowed) {
    res.status(400).json({ success: false, error: gate.reason });
    return;
  }
*/
class ActionNotAllowedError extends Error {
    constructor(message) {
        super(message);
        this.name = "ActionNotAllowedError";
    }
}
exports.ActionNotAllowedError = ActionNotAllowedError;
function statusUpper(order) {
    return String(order.status ?? "").trim().toUpperCase();
}
function isBlocked(order) {
    return String(order.blockedReason ?? "").trim().length > 0;
}
const PUBLISH_STATUSES = new Set(["QUOTE_READY", "APPROVED", "INVOICE_DRAFTED"]);
const DEPOSIT_STATUSES_ORDER = new Set([
    "DEPOSIT_PAID",
    "PRODUCTION_READY",
    "PAID_IN_FULL",
]);
const DIGITIZING_NOTE_MARKERS = [
    "embroidery",
    "digitize",
    "embroidered",
    "left chest logo",
];
function notesLower(notes) {
    return String(notes ?? "").toLowerCase();
}
function hasDigitizingSignal(order) {
    const pm = String(order.printMethod ?? "").trim().toUpperCase();
    if (pm === "EMB" || pm.includes("EMBROID"))
        return true;
    const n = notesLower(order.notes);
    for (const m of DIGITIZING_NOTE_MARKERS) {
        if (n.includes(m))
            return true;
    }
    return false;
}
function evaluatePublishInvoice(order) {
    if (!order.isApproved) {
        return { allowed: false, reason: "Order is not approved" };
    }
    if (!PUBLISH_STATUSES.has(statusUpper(order))) {
        return {
            allowed: false,
            reason: `Invoice publish requires status QUOTE_READY, APPROVED, or INVOICE_DRAFTED (current: ${order.status ?? "unknown"})`,
        };
    }
    const q = order.quotedAmount;
    if (q === null || q === undefined || Number.isNaN(q) || q < 250) {
        return {
            allowed: false,
            reason: "Quoted amount is missing or below the $250 minimum for publishing an invoice",
        };
    }
    if (isBlocked(order)) {
        return {
            allowed: false,
            reason: `Order is blocked: ${String(order.blockedReason).trim()}`,
        };
    }
    return { allowed: true };
}
function evaluateOrderGarments(order) {
    if (!order.depositReceived) {
        return { allowed: false, reason: "Deposit has not been received" };
    }
    if (!DEPOSIT_STATUSES_ORDER.has(statusUpper(order))) {
        return {
            allowed: false,
            reason: `Garment ordering requires status DEPOSIT_PAID, PRODUCTION_READY, or PAID_IN_FULL (current: ${order.status ?? "unknown"})`,
        };
    }
    const qty = order.quantity;
    if (qty === null || qty === undefined || qty <= 0) {
        return {
            allowed: false,
            reason: "Quantity is missing or must be greater than zero",
        };
    }
    if (order.garmentType === null || String(order.garmentType).trim() === "") {
        return { allowed: false, reason: "Garment type is missing" };
    }
    return { allowed: true };
}
function evaluateRequestDigitizing(order) {
    if (!order.depositReceived) {
        return { allowed: false, reason: "Deposit has not been received" };
    }
    if (!DEPOSIT_STATUSES_ORDER.has(statusUpper(order))) {
        return {
            allowed: false,
            reason: `Digitizing requests require status DEPOSIT_PAID, PRODUCTION_READY, or PAID_IN_FULL (current: ${order.status ?? "unknown"})`,
        };
    }
    if (!hasDigitizingSignal(order)) {
        return {
            allowed: false,
            reason: "Digitizing is only allowed when print method is embroidery (EMB) or notes mention embroidery / digitizing / left chest logo",
        };
    }
    return { allowed: true };
}
function evaluateRouteProduction(order) {
    if (!order.depositReceived) {
        return { allowed: false, reason: "Deposit has not been received" };
    }
    if (!DEPOSIT_STATUSES_ORDER.has(statusUpper(order))) {
        return {
            allowed: false,
            reason: `Production routing requires status DEPOSIT_PAID, PRODUCTION_READY, or PAID_IN_FULL (current: ${order.status ?? "unknown"})`,
        };
    }
    const qty = order.quantity;
    if (qty === null || qty === undefined || qty <= 0) {
        return {
            allowed: false,
            reason: "Quantity is missing or must be greater than zero for production routing",
        };
    }
    return { allowed: true };
}
function evaluateCreateJob(order) {
    const ds = String(order.depositStatus ?? "NONE").toUpperCase();
    const paid = order.depositReceived === true || ds === "PAID";
    if (!paid) {
        return { allowed: false, reason: "Deposit has not been received" };
    }
    const st = statusUpper(order);
    if (st !== "DEPOSIT_PAID" &&
        st !== "PAID_IN_FULL" &&
        st !== "PRODUCTION_READY") {
        return {
            allowed: false,
            reason: `Creating a job requires status DEPOSIT_PAID, PRODUCTION_READY, or PAID_IN_FULL (current: ${order.status ?? "unknown"})`,
        };
    }
    if (order.jobCreated === true) {
        return { allowed: false, reason: "Job already exists" };
    }
    return { allowed: true };
}
const QC_STATUSES = new Set(["PRODUCTION_READY", "PRODUCTION", "QC"]);
function evaluateMarkQcReady(order) {
    if (!QC_STATUSES.has(statusUpper(order))) {
        return {
            allowed: false,
            reason: `QC transition requires status PRODUCTION_READY, PRODUCTION, or QC (current: ${order.status ?? "unknown"})`,
        };
    }
    if (order.jobCreated !== true) {
        return {
            allowed: false,
            reason: "Production job has not been created yet",
        };
    }
    return { allowed: true };
}
function evaluateActionSafety(order, action) {
    switch (action) {
        case "PUBLISH_INVOICE":
            return evaluatePublishInvoice(order);
        case "ORDER_GARMENTS":
            return evaluateOrderGarments(order);
        case "REQUEST_DIGITIZING":
            return evaluateRequestDigitizing(order);
        case "ROUTE_PRODUCTION":
            return evaluateRouteProduction(order);
        case "CREATE_JOB":
            return evaluateCreateJob(order);
        case "MARK_QC_READY":
            return evaluateMarkQcReady(order);
    }
}
function assertActionAllowed(order, action) {
    const d = evaluateActionSafety(order, action);
    if (!d.allowed) {
        (0, exceptionReviewService_1.logExceptionReviewSafe)({
            orderId: order.id,
            jobId: null,
            type: "SAFETY_GUARD_DENIAL",
            source: "SAFETY_GUARD",
            severity: "MEDIUM",
            message: d.reason ?? "Action not allowed",
            detailsJson: JSON.stringify({ action }),
        });
        throw new ActionNotAllowedError(d.reason ?? "Action not allowed");
    }
}
