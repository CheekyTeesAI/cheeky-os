"use strict";

/**
 * @param {object} summary
 * @param {number} summary.processed
 * @param {number} summary.hotLeads
 * @param {{ pending: number, approved: number, sent: number, failed: number }} summary.queue
 * @returns {string[]}
 */
function getNextActions(summary) {
  const processed = Number(summary.processed) || 0;
  const hotLeads = Number(summary.hotLeads) || 0;
  const queue = summary.queue || {};
  const pending = Number(queue.pending) || 0;
  const pendingFollowup = Number(queue.pending_followup) || 0;
  const pendingAll = pending + pendingFollowup;
  const approved = Number(queue.approved) || 0;
  const failed = Number(queue.failed) || 0;

  const out = [];
  function add(s) {
    if (!out.includes(s)) out.push(s);
  }

  if (hotLeads > 0 && pendingAll > 0) add("Approve hot leads first");
  if (pendingAll > 0) add("Review pending queue");
  if (approved > 0) add("Send approved messages");
  if (failed > 0) add("Retry failed outreach");
  if (processed === 0) add("Refresh lead source / customer pull");

  return out;
}

module.exports = { getNextActions };
