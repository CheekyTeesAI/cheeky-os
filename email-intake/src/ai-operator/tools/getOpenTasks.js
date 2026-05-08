"use strict";

/** Phase 1 stub — register when task board / intake queue tooling is routed */
async function handler(/* params */ _params = {}) {
  return {
    status: "NOT_IMPLEMENTED_PHASE1",
    message:
      "getOpenTasks is not wired. Future: merge Dataverse/production tasks behind READ_ONLY intents.",
  };
}

module.exports = { handler };
