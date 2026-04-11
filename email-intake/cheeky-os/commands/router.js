/**
 * Cheeky OS — Command router.
 * Maps natural-language text to a known action + params.
 *
 * @module cheeky-os/commands/router
 */

/**
 * Route a text command to an action.
 * @param {string} text
 * @returns {{ action: string, params: object }}
 */
function routeCommand(text) {
  const lower = (text || "").toLowerCase().trim();

  if (lower.includes("follow up") || lower.includes("followup")) {
    return { action: "run_followups", params: {} };
  }

  if (lower.includes("hot deal") || lower.includes("hot deals")) {
    return { action: "get_hot", params: {} };
  }

  if (lower.includes("unpaid")) {
    return { action: "get_unpaid", params: {} };
  }

  if (lower.includes("next")) {
    return { action: "get_next", params: {} };
  }

  if (lower.includes("invoice")) {
    return { action: "create_invoice", params: {} };
  }

  if (lower.includes("reactivate customers")) {
    return { action: "reactivate_customers", params: {} };
  }

  if (lower.includes("list dormant customers") || lower.includes("dormant customers")) {
    return { action: "list_dormant_customers", params: {} };
  }

  return { action: "unknown", params: {} };
}

module.exports = { routeCommand };
