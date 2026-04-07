/**
 * Bundle 30 — map interpreted intent to a queueable next-step action (no AI, no DB).
 */

/**
 * @param {{
 *   customerName?: string,
 *   orderId?: string,
 *   interpretation: {
 *     intent?: string,
 *     confidence?: string,
 *     signals?: string[],
 *     recommendedNextStep?: string,
 *   },
 * }} input
 * @returns {{
 *   actionType: "invoice"|"followup"|"review"|"clarify"|"later_followup"|"none",
 *   shouldQueue: boolean,
 *   priority: "low"|"medium"|"high"|"critical",
 *   reason: string,
 *   actionLabel: string,
 * }}
 */
function buildQueuedActionFromInterpretation(input) {
  const interpretation = input && typeof input.interpretation === "object"
    ? input.interpretation
    : {};
  const intent = String(interpretation.intent || "unknown").trim();

  /** @type {Record<string, { actionType: string, shouldQueue: boolean, priority: string, reason: string, actionLabel: string }>} */
  const table = {
    ready_to_pay: {
      actionType: "invoice",
      shouldQueue: true,
      priority: "critical",
      reason: "Customer ready to pay or requested an invoice",
      actionLabel: "Create draft invoice",
    },
    interested: {
      actionType: "followup",
      shouldQueue: true,
      priority: "high",
      reason: "Positive engagement; follow up personally",
      actionLabel: "Follow up personally",
    },
    needs_revision: {
      actionType: "review",
      shouldQueue: true,
      priority: "high",
      reason: "Customer asked for edits or a different direction",
      actionLabel: "Review revision request",
    },
    question: {
      actionType: "clarify",
      shouldQueue: true,
      priority: "high",
      reason: "Open question needs a clear answer",
      actionLabel: "Respond with clarification",
    },
    not_now: {
      actionType: "later_followup",
      shouldQueue: true,
      priority: "medium",
      reason: "Customer deferred; revisit on a later cadence",
      actionLabel: "Revisit later",
    },
    unknown: {
      actionType: "none",
      shouldQueue: false,
      priority: "low",
      reason: "Reply was ambiguous or did not match a clear intent",
      actionLabel: "Manual review",
    },
  };

  const row = table[intent] || table.unknown;
  return {
    actionType: /** @type {"invoice"|"followup"|"review"|"clarify"|"later_followup"|"none"} */ (
      row.actionType
    ),
    shouldQueue: row.shouldQueue,
    priority: /** @type {"low"|"medium"|"high"|"critical"} */ (row.priority),
    reason: row.reason,
    actionLabel: row.actionLabel,
  };
}

module.exports = {
  buildQueuedActionFromInterpretation,
};
