"use strict";
function getNextBestCashActions(input) {
    const outreach = (input && input.outreach) || {};
    const queue = (input && input.queue) || {};
    const system = (input && input.system) || {};
    const out = [];
    const add = (s) => {
        if (!out.includes(s))
            out.push(s);
    };
    const approved = Number(queue.approved) || 0;
    const pending = Number(queue.pending) || 0;
    const failed = Number(queue.failed) || 0;
    const sent = Number(queue.sent) || 0;
    const pendingFollowup = Number(queue.pendingFollowup) || Number(queue.pending_followup) || 0;
    const hotLeads = Number(outreach.hotLeads) || 0;
    const processed = Number(outreach.processed) || 0;
    const autoSend = system.autoSend === true;
    const dryRun = system.dryRun === true;
    if (approved > 0 && !autoSend)
        add("Send approved outreach now");
    if (hotLeads > 0 && pending > 0)
        add("Review and approve hot leads first");
    if (failed > 0)
        add("Retry failed outreach");
    if (pendingFollowup > 0)
        add("Review follow-up queue");
    if (processed === 0)
        add("Refresh or reconnect lead source");
    if (sent > 0)
        add("Check inbox for replies and convert interested leads");
    if (!autoSend && dryRun) {
        add("System is in safe mode; enable live sending only when ready");
    }
    return out;
}
module.exports = { getNextBestCashActions };
