"use strict";

/** Phase 1 stub — register in toolRegistry when Graph/Gmail search is implemented (READ_ONLY). */
async function handler/* no-op arity */(/* params */ _params = {}) {
  return {
    status: "NOT_IMPLEMENTED_PHASE1",
    message:
      "searchEmails tool is scaffolded only. Implement via emailConnector.searchEmails after Phase 1 foundation sign-off.",
  };
}

module.exports = { handler };
