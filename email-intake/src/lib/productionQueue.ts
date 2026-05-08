/**
 * Internal production queue contract for order/job production flow.
 * Pure helpers only — does not persist; callers keep existing DB writes and string values.
 *
 * Aligns with common `OrderStatus` / `job.status` / `order.productionStatus` literals
 * (PRODUCTION_READY, PRINTING, QC, READY, etc.) without changing schema.
 */

export type NormalizedProductionQueueState =
  | "PRODUCTION_READY"
  | "PRINTING"
  | "QC"
  | "READY_FOR_PICKUP";

/** Linear lane used for validation and operator UX — not a scheduler. */
const QUEUE_LANE: readonly NormalizedProductionQueueState[] = [
  "PRODUCTION_READY",
  "PRINTING",
  "QC",
  "READY_FOR_PICKUP",
] as const;

const DISPLAY: Record<NormalizedProductionQueueState, string> = {
  PRODUCTION_READY: "Production ready",
  PRINTING: "Printing",
  QC: "QC",
  READY_FOR_PICKUP: "Ready for pickup",
};

export type ProductionQueueView = {
  /** Canonical lane position, or UNKNOWN when unmapped. */
  normalizedState: NormalizedProductionQueueState | "UNKNOWN";
  /** Raw input string (trimmed) for audit. */
  sourceStatus: string;
  displayLabel: string;
  allowedNextStates: NormalizedProductionQueueState[];
  updatedAt?: string;
  notes?: string;
};

function normUpper(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Map persisted status strings (order/job/production) onto the internal queue lane.
 * Preserves drift: PRODUCTION / IN_PRODUCTION → PRINTING; READY → READY_FOR_PICKUP.
 */
export function normalizeProductionQueueState(
  source: string | null | undefined
): NormalizedProductionQueueState | "UNKNOWN" {
  const u = normUpper(source ?? "");
  if (!u) return "UNKNOWN";

  if (u === "PRODUCTION_READY") return "PRODUCTION_READY";
  if (
    u === "PRINTING" ||
    u === "IN_PRODUCTION" ||
    u === "PRODUCTION"
  ) {
    return "PRINTING";
  }
  if (u === "QC") return "QC";
  if (u === "READY_FOR_PICKUP" || u === "READY") {
    return "READY_FOR_PICKUP";
  }
  return "UNKNOWN";
}

function allowedForwardNext(
  current: NormalizedProductionQueueState | "UNKNOWN"
): NormalizedProductionQueueState[] {
  if (current === "UNKNOWN") return [];
  const i = QUEUE_LANE.indexOf(current);
  if (i < 0 || i >= QUEUE_LANE.length - 1) return [];
  return [QUEUE_LANE[i + 1] as NormalizedProductionQueueState];
}

/**
 * Full queue view: normalized state, human label, and single forward next step (if any).
 */
export function describeProductionQueue(
  source: string | null | undefined,
  opts?: { updatedAt?: Date; notes?: string }
): ProductionQueueView {
  const raw = source == null ? "" : String(source).trim();
  const normalizedState = normalizeProductionQueueState(raw);
  const displayLabel =
    normalizedState === "UNKNOWN"
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

export type TransitionDecision = {
  allowed: boolean;
  reason?: string;
};

/**
 * Validates forward-only moves along PRODUCTION_READY → PRINTING → QC → READY_FOR_PICKUP.
 * Same-state is allowed (idempotent). UNKNOWN or skipping steps is not allowed.
 */
export function transitionProductionQueueState(
  fromSource: string | null | undefined,
  to: NormalizedProductionQueueState
): TransitionDecision {
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
export const INITIAL_PRODUCTION_QUEUE_STATE: NormalizedProductionQueueState =
  "PRODUCTION_READY";

/**
 * String persisted on `Job.status` / `order.productionStatus` for the initial lane step.
 * Keeps today’s stored values identical while centralizing the literal.
 */
export function persistedQueueStatusForNormalized(
  state: NormalizedProductionQueueState
): string {
  if (state === "READY_FOR_PICKUP") {
    return "READY";
  }
  return state;
}
