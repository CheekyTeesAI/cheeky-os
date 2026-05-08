"use strict";

/**
 * Unify inbound aiReplyDraft vs closer replyDraft.
 * Closer wins for quote/order/payment/status classifications.
 */

const CLOSER_WINS = new Set(["quote_request", "order_interest", "payment_ready", "status_request"]);

/**
 * @param {object} opts
 * @param {string} opts.classification
 * @param {object|null} opts.closerReplyDraft - { subject, body }
 * @param {object|null} opts.inboundAiReplyDraft - { subject, body }
 * @returns {{ source: string, subject: string, body: string, requiresApproval: boolean, canSend: boolean }}
 */
function buildCanonicalReply(opts) {
  const classification       = String((opts && opts.classification) || "general_reply");
  const closerReplyDraft     = opts && opts.closerReplyDraft;
  const inboundAiReplyDraft  = opts && opts.inboundAiReplyDraft;

  const closerWins = CLOSER_WINS.has(classification);
  if (closerWins && closerReplyDraft && (closerReplyDraft.body || closerReplyDraft.subject)) {
    return {
      source: "closer",
      subject: closerReplyDraft.subject || "Re: Cheeky Tees",
      body: closerReplyDraft.body || "",
      requiresApproval: true,
      canSend: false,
    };
  }

  if (inboundAiReplyDraft && (inboundAiReplyDraft.body || inboundAiReplyDraft.subject)) {
    return {
      source: "inbound",
      subject: inboundAiReplyDraft.subject || "Re: Cheeky Tees",
      body: inboundAiReplyDraft.body || "",
      requiresApproval: true,
      canSend: false,
    };
  }

  if (closerReplyDraft && (closerReplyDraft.body || closerReplyDraft.subject)) {
    return {
      source: "fallback",
      subject: closerReplyDraft.subject || "Re: Cheeky Tees",
      body: closerReplyDraft.body || "",
      requiresApproval: true,
      canSend: false,
    };
  }

  return {
    source: "fallback",
    subject: "Re: Cheeky Tees",
    body: "Thanks for your message. We'll review and follow up shortly.\n\nThanks,\nCheeky Tees",
    requiresApproval: true,
    canSend: false,
  };
}

module.exports = { buildCanonicalReply, CLOSER_WINS };
