"use strict";

/** Phase 1 stub — will be APPROVAL_REQUIRED when registered (never auto-send from operator). */
async function handler(/* params */ _params = {}) {
  return {
    status: "NOT_IMPLEMENTED_PHASE1",
    message:
      "createFollowupDraft will require human approval gates and outbound comms safeguards before registration.",
  };
}

module.exports = { handler };
