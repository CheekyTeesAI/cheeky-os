/**
 * Bundle 33 — template reply drafts from intent (no AI, no DB, no send).
 */

/**
 * @param {{ customerName?: string, intent?: string, amount?: number }} input
 * @returns {{ draft: string, intent: string }}
 */
function buildReplyDraft(input) {
  const intent = String(input && input.intent != null ? input.intent : "unknown").trim();
  /** @type {Record<string, string>} */
  const byIntent = {
    ready_to_pay:
      "Perfect — I'll get that invoice over to you now so we can get started.",
    interested:
      "Awesome — I'll get everything lined up for you. Want me to send over a quick invoice to lock it in?",
    needs_revision:
      "Got it — I'll make those updates and send you a revised version shortly.",
    question:
      "Great question — here's what I recommend: share timing and qty and I'll line it up. I can also get you a quick quote if you'd like.",
    not_now:
      "No worries at all — I'll check back in with you soon. Just let me know whenever you're ready.",
    unknown:
      "Got your message — I'll take a look and follow up with you shortly.",
  };

  const draft = byIntent[intent] || byIntent.unknown;
  return { draft, intent };
}

module.exports = {
  buildReplyDraft,
};
