"use strict";

/**
 * If no response, next touch in 24 hours (simulated scheduler output).
 * @param {{ customerId?: string }} [_ctx]
 * @returns {{ followUpScheduled: boolean, nextContactAt: string }}
 */
function scheduleFollowUp(_ctx) {
  const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    followUpScheduled: true,
    nextContactAt: next.toISOString()
  };
}

module.exports = { scheduleFollowUp };
