"use strict";
/**
 * Internal production queue contract for order/job production flow.
 * Pure helpers only — does not persist; callers keep existing DB writes and string values.
 *
 * Aligns with common `OrderStatus` / `job.status` / `order.productionStatus` literals
 * (PRODUCTION_READY, PRINTING, QC, READY, etc.) without changing schema.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.INITIAL_PRODUCTION_QUEUE_STATE = void 0;
exports.normalizeProductionQueueState = normalizeProductionQueueState;
exports.describeProductionQueue = describeProductionQueue;
exports.transitionProductionQueueState = transitionProductionQueueState;
exports.persistedQueueStatusForNormalized = persistedQueueStatusForNormalized;
/** Linear lane used for validation and operator UX — not a scheduler. */
const QUEUE_LANE = [
    "PRODUCTION_READY",
    "PRINTING",
    "QC",
    "READY_FOR_PICKUP",
];
const DISPLAY = {
    PRODUCTION_READY: "Production ready",
    PRINTING: "Printing",
    QC: "QC",
    READY_FOR_PICKUP: "Ready for pickup",
};
function normUpper(s) {
    return s.trim().toUpperCase();
}
/**
 * Map persisted status strings (order/job/production) onto the internal queue lane.
 * Preserves drift: PRODUCTION / IN_PRODUCTION → PRINTING; READY → READY_FOR_PICKUP.
 */
function normalizeProductionQueueState(source) {
    const u = normUpper(source ?? "");
    if (!u)
        return "UNKNOWN";
    if (u === "PRODUCTION_READY")
        return "PRODUCTION_READY";
    if (u === "PRINTING" ||
        u === "IN_PRODUCTION" ||
        u === "PRODUCTION") {
        return "PRINTING";
    }
    if (u === "QC")
        return "QC";
    if (u === "READY_FOR_PICKUP" || u === "READY") {
        return "READY_FOR_PICKUP";
    }
    return "UNKNOWN";
}
function allowedForwardNext(current) {
    if (current === "UNKNOWN")
        return [];
    const i = QUEUE_LANE.indexOf(current);
    if (i < 0 || i >= QUEUE_LANE.length - 1)
        return [];
    return [QUEUE_LANE[i + 1]];
}
/**
 * Full queue view: normalized state, human label, and single forward next step (if any).
 */
function describeProductionQueue(source, opts) {
    const raw = source == null ? "" : String(source).trim();
    const normalizedState = normalizeProductionQueueState(raw);
    const displayLabel = normalizedState === "UNKNOWN"
        ? raw || "(empty)"
        : DISPLAY[normalizedState];
    return {
        normalizedState,
        sourceStatus: raw || "(empty)",
        displayLabel,
        allowedNextStates: allowedForwardNext(normalizedState),
        updatedAt: opts?.updatedAt?.toISOString(),
        notes: opts?.notes,
    };
}
/**
 * Validates forward-only moves along PRODUCTION_READY → PRINTING → QC → READY_FOR_PICKUP.
 * Same-state is allowed (idempotent). UNKNOWN or skipping steps is not allowed.
 */
function transitionProductionQueueState(fromSource, to) {
    const from = normalizeProductionQueueState(fromSource);
    if (from === "UNKNOWN") {
        return {
            allowed: false,
            reason: "Source queue state is unknown or unmapped; resolve status before transitioning",
        };
    }
    if (from === to) {
        return { allowed: true, reason: "No-op (already in target state)" };
    }
    const iFrom = QUEUE_LANE.indexOf(from);
    const iTo = QUEUE_LANE.indexOf(to);
    if (iFrom < 0 || iTo < 0) {
        return { allowed: false, reason: "Invalid queue state" };
    }
    if (iTo === iFrom + 1) {
        return { allowed: true };
    }
    return {
        allowed: false,
        reason: `Transition ${from} -> ${to} is not the next queue step`,
    };
}
/** Default lane position when a job is created / routed into production. */
exports.INITIAL_PRODUCTION_QUEUE_STATE = "PRODUCTION_READY";
/**
 * String persisted on `Job.status` / `order.productionStatus` for the initial lane step.
 * Keeps today’s stored values identical while centralizing the literal.
 */
function persistedQueueStatusForNormalized(state) {
    if (state === "READY_FOR_PICKUP") {
        return "READY";
    }
    return state;
}
