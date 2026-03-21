// PHASE 6 — CHEEKY BRIDGE v0.1: Command router
/**
 * Routes a parsed Bridge ticket to the correct handler based on
 * commandType and targetArea. Currently logs the routing decision
 * and saves the ticket to /bridge/tickets/ or /bridge/errors/.
 *
 * Future: will dispatch to actual build functions, flow creators, etc.
 *
 * @module bridge/route-command
 */

const fs = require("fs");
const path = require("path");

/** Directory for successfully routed tickets. */
const TICKETS_DIR = path.join(__dirname, "tickets");

/** Directory for unroutable/unknown tickets. */
const ERRORS_DIR = path.join(__dirname, "errors");

// Ensure directories exist
fs.mkdirSync(TICKETS_DIR, { recursive: true });
fs.mkdirSync(ERRORS_DIR, { recursive: true });

/**
 * Save a ticket to disk as a JSON file.
 * @param {Object} ticket - The parsed Bridge ticket.
 * @param {string} dir    - Target directory (tickets/ or errors/).
 * @returns {string} The full path of the saved file.
 */
function saveTicket(ticket, dir) {
  const filename = `${ticket.id}.json`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(ticket, null, 2));
  return filepath;
}

/**
 * Route a parsed Bridge ticket based on its commandType.
 * Saves the ticket to the appropriate directory and returns
 * routing metadata.
 *
 * @param {Object} ticket - Parsed Bridge ticket from parse-command.js.
 * @returns {Object} Routing result with { routed, savedTo, action, ticket }.
 */
function routeCommand(ticket) {
  // UNKNOWN commands go to errors/
  if (ticket.commandType === "UNKNOWN" || ticket.status === "UNKNOWN") {
    const savedTo = saveTicket(ticket, ERRORS_DIR);
    return {
      routed: false,
      savedTo,
      action: "NEEDS_CLARIFICATION",
      message: `Command could not be classified. Saved to ${savedTo}. Please clarify.`,
      ticket,
    };
  }

  // All other commands get saved to tickets/
  ticket.status = "NEW";
  const savedTo = saveTicket(ticket, TICKETS_DIR);

  // Build a human-readable routing summary
  const routingTable = {
    BUILD_FEATURE: "Queue for GitHub Copilot to build.",
    MODIFY_FEATURE: "Queue for GitHub Copilot to modify existing code.",
    CREATE_TABLE: "Queue for Dataverse schema creation.",
    UPDATE_TABLE: "Queue for Dataverse column additions/changes.",
    CREATE_FLOW: "Queue for Power Automate flow creation.",
    UPDATE_FLOW: "Queue for Power Automate flow modification.",
    CREATE_UI: "Queue for UI/screen creation.",
    FIX_BUG: "Queue for immediate bug fix by GitHub Copilot.",
    QUOTE_OPS: "Route to quoting operations handler.",
    SALES_OPS: "Route to sales operations handler.",
    PRODUCTION_OPS: "Route to production operations handler.",
    DOCUMENT_SYSTEM: "Queue for documentation generation.",
  };

  const action = routingTable[ticket.commandType] || "Route to general handler.";

  return {
    routed: true,
    savedTo,
    action,
    message: `Ticket ${ticket.id} routed: ${ticket.commandType} → ${ticket.targetArea}. ${action}`,
    ticket,
  };
}

/**
 * List all saved tickets from the tickets/ directory.
 * @returns {Array<Object>} Array of parsed ticket objects.
 */
function listTickets() {
  const files = fs.readdirSync(TICKETS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const content = fs.readFileSync(path.join(TICKETS_DIR, f), "utf-8");
    return JSON.parse(content);
  });
}

/**
 * List all saved error tickets from the errors/ directory.
 * @returns {Array<Object>} Array of parsed error ticket objects.
 */
function listErrors() {
  const files = fs.readdirSync(ERRORS_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const content = fs.readFileSync(path.join(ERRORS_DIR, f), "utf-8");
    return JSON.parse(content);
  });
}

module.exports = { routeCommand, saveTicket, listTickets, listErrors, TICKETS_DIR, ERRORS_DIR };
