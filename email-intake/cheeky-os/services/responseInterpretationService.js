/**
 * Bundle 29 — pure keyword interpretation of inbound customer text (no AI, no DB).
 */

const NEXT_STEP = {
  ready_to_pay: "Create draft invoice",
  interested: "Follow up personally",
  needs_revision: "Review revisions before invoicing",
  not_now: "Set later follow-up",
  question: "Respond with clarification",
  unknown: "Manual review",
};

/**
 * @param {string} raw
 */
function norm(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} hay
 * @param {string[]} needles
 */
function anyIncludes(hay, needles) {
  for (const n of needles) {
    if (n && hay.includes(n)) return n;
  }
  return "";
}

/**
 * @param {{ customerName?: string, message?: string }} input
 * @returns {{
 *   intent: "ready_to_pay"|"interested"|"needs_revision"|"not_now"|"question"|"unknown",
 *   confidence: "low"|"medium"|"high",
 *   signals: string[],
 *   recommendedNextStep: string
 * }}
 */
function interpretCustomerResponse(input) {
  const msg = String((input && input.message) || "").trim();
  const lower = norm(msg);
  /** @type {string[]} */
  const signals = [];

  if (!msg) {
    return {
      intent: "unknown",
      confidence: "low",
      signals: ["empty_message"],
      recommendedNextStep: NEXT_STEP.unknown,
    };
  }

  const hitNot = anyIncludes(lower, [
    "later",
    "not yet",
    "hold off",
    "maybe later",
    "not right now",
  ]);
  if (hitNot) {
    signals.push(`not_now:${hitNot}`);
    return {
      intent: "not_now",
      confidence: "high",
      signals,
      recommendedNextStep: NEXT_STEP.not_now,
    };
  }

  const hitRev = anyIncludes(lower, [
    "change ",
    " revise",
    "revision",
    "edit ",
    "different design",
    "adjust",
    " redo",
    "update the",
  ]);
  if (hitRev || /\bchange\b/.test(lower) || /\bedit\b/.test(lower)) {
    signals.push(hitRev ? `needs_revision:${hitRev}` : "needs_revision:keyword");
    return {
      intent: "needs_revision",
      confidence: "high",
      signals,
      recommendedNextStep: NEXT_STEP.needs_revision,
    };
  }

  const hitPay = anyIncludes(lower, [
    "send invoice",
    "send the invoice",
    "send me the invoice",
    "pay now",
    "ready to pay",
    "let's do it",
    "lets do it",
    "let’s do it",
    "good to go",
    "go ahead and invoice",
    "invoice me",
  ]);
  if (hitPay) {
    signals.push(`ready_to_pay:${hitPay}`);
    return {
      intent: "ready_to_pay",
      confidence: "high",
      signals,
      recommendedNextStep: NEXT_STEP.ready_to_pay,
    };
  }
  if (/\bready\b/.test(lower) && anyIncludes(lower, ["pay", "invoice", "order", "go"])) {
    signals.push("ready_to_pay:ready+context");
    return {
      intent: "ready_to_pay",
      confidence: "medium",
      signals,
      recommendedNextStep: NEXT_STEP.ready_to_pay,
    };
  }

  const hitQ =
    msg.includes("?") ||
    !!anyIncludes(lower, [
      "how much",
      "how long",
      "what's the",
      "whats the",
      "what is the",
      "turnaround",
      "can you ",
      "could you ",
      "when can",
      "do you offer",
    ]);
  if (hitQ) {
    signals.push(msg.includes("?") ? "question:question_mark" : "question:phrase");
    return {
      intent: "question",
      confidence: "high",
      signals,
      recommendedNextStep: NEXT_STEP.question,
    };
  }

  const hitYes = anyIncludes(lower, [
    "sounds good",
    "want to move forward",
    "let's talk",
    "lets talk",
    "move forward",
    "i'm interested",
    "im interested",
    "we're interested",
  ]);
  if (
    hitYes ||
    /\byes\b/.test(lower) ||
    /\byep\b/.test(lower) ||
    /\bsure\b/.test(lower)
  ) {
    signals.push(hitYes ? `interested:${hitYes}` : "interested:affirmation");
    return {
      intent: "interested",
      confidence: hitYes ? "high" : "medium",
      signals,
      recommendedNextStep: NEXT_STEP.interested,
    };
  }

  signals.push("unknown:no_rule_match");
  return {
    intent: "unknown",
    confidence: "low",
    signals,
    recommendedNextStep: NEXT_STEP.unknown,
  };
}

module.exports = {
  interpretCustomerResponse,
  NEXT_STEP,
};
