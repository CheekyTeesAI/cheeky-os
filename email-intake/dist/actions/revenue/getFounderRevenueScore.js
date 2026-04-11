"use strict";
function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}
function scoreLabel(score) {
    if (score <= 24)
        return "LOW";
    if (score <= 49)
        return "WARM";
    if (score <= 74)
        return "ACTIVE";
    return "HOT";
}
function getFounderRevenueScore(input) {
    const outreach = (input && input.outreach) || {};
    const queue = (input && input.queue) || {};
    let score = 0;
    const hotLeads = Number(outreach.hotLeads) || 0;
    const processed = Number(outreach.processed) || 0;
    const messagesGenerated = Number(outreach.messagesGenerated) || 0;
    const approved = Number(queue.approved) || 0;
    const sent = Number(queue.sent) || 0;
    const failed = Number(queue.failed) || 0;
    const pendingFollowup = Number(queue.pendingFollowup) || Number(queue.pending_followup) || 0;
    if (hotLeads > 0)
        score += 20;
    if (approved > 0)
        score += 20;
    if (pendingFollowup > 0)
        score += 15;
    if (sent > 0)
        score += 10;
    if (failed > 3)
        score -= 15;
    if (processed === 0)
        score -= 20;
    if (messagesGenerated >= 3)
        score += 10;
    const normalized = clamp(score, 0, 100);
    return {
        score: normalized,
        label: scoreLabel(normalized)
    };
}
module.exports = { getFounderRevenueScore };
