/**
 * Cheeky OS — Maps voice/shortcut intents to command executor actions.
 *
 * @module cheeky-os/commands/intent-bridge
 */

/** Intent enum (from intent-parser) → executor action name. */

/**
 * Convert a classified intent + params into an executor command.
 * @param {string} intent
 * @param {object} [params]
 * @returns {{ action: string, params: object }|null}
 */

const INTENT_ACTION_MAP = {
  RUN_FOLLOWUP: "run_followups",
  GENERATE_QUOTE: "generate_quote",
  CLOSE_DEAL: "close_deal",
  CREATE_INVOICE: "create_invoice",
  GET_CASH_SUMMARY: "get_cash_summary",

  GET_UNPAID: "get_unpaid", 

  GET_PRODUCTION_QUEUE: "get_production_queue",
  OUTREACH_LEADS: "outreach_leads",
  GET_HEALTH: "get_health",
  TRIGGER_BUILD: "trigger_build",
  ROLLBACK: "rollback",
};

function intentToCommand(intent, params = {}) {
  const action = INTENT_ACTION_MAP[intent];
  if (!action) return null;

  const p = params && typeof params === "object" ? params : {};
  return { action, params: p };
}

/**
 * Intents valid for POST /voice/shortcut (same as mapped intents).
 * @returns {string[]}
 */
function listShortcutIntents() {
  return Object.keys(INTENT_ACTION_MAP);
}

module.exports = { intentToCommand, listShortcutIntents, INTENT_ACTION_MAP };
