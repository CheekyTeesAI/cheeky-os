// PHASE 6 — CHEEKY BRIDGE v0.1: Command parser
/**
 * Parses a plain-English command from Pat/Chad into a structured
 * Bridge ticket. Uses keyword matching against command-types.json
 * to classify the command type and target area.
 *
 * No external dependencies — pure string matching.
 *
 * @module bridge/parse-command
 */

const crypto = require("crypto");
const commandTypes = require("./command-types.json");

/**
 * Generate a unique ticket ID.
 * Format: CB-YYYYMMDD-{random6}
 * @returns {string} Unique ticket ID.
 */
function generateTicketId() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const rand = crypto.randomBytes(3).toString("hex");
  return `CB-${date}-${rand}`;
}

/**
 * Classify a command into a commandType by keyword matching.
 * Scores each type by how many keywords appear in the command text.
 * Highest score wins. Ties broken by order in command-types.json.
 * @param {string} text - Lowercase command text.
 * @returns {string} Best-matching commandType key.
 */
function classifyCommandType(text) {
  let bestType = "UNKNOWN";
  let bestScore = 0;

  for (const [typeName, typeDef] of Object.entries(commandTypes.commandTypes)) {
    if (typeName === "UNKNOWN") continue;
    let score = 0;
    for (const kw of typeDef.keywords) {
      if (text.includes(kw)) {
        score += kw.split(" ").length; // Multi-word keywords score higher
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = typeName;
    }
  }

  return bestType;
}

/**
 * Classify the target area of the command by keyword matching.
 * @param {string} text - Lowercase command text.
 * @returns {string} Best-matching targetArea key.
 */
function classifyTargetArea(text) {
  let bestArea = "unknown";
  let bestScore = 0;

  for (const [area, keywords] of Object.entries(commandTypes.targetAreaKeywords)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        score += kw.split(" ").length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestArea = area;
    }
  }

  return bestArea;
}

/**
 * Detect priority from command text. Looks for urgency markers.
 * @param {string} text - Lowercase command text.
 * @returns {string} "HIGH" | "MEDIUM" | "LOW"
 */
function detectPriority(text) {
  const highWords = ["urgent", "asap", "now", "immediately", "critical", "emergency", "rush"];
  const lowWords = ["when you can", "low priority", "eventually", "no rush", "nice to have", "someday"];

  for (const w of highWords) {
    if (text.includes(w)) return "HIGH";
  }
  for (const w of lowWords) {
    if (text.includes(w)) return "LOW";
  }
  return "MEDIUM";
}

/**
 * Extract entity references (tables, fields, flows, integrations) from text.
 * @param {string} text - Lowercase command text.
 * @returns {Object} Entities object matching the ticket schema.
 */
function extractEntities(text) {
  const entities = {
    tables: [],
    flows: [],
    screens: [],
    fields: [],
    integrations: [],
  };

  // Detect Dataverse table names (ct_ prefix pattern)
  const tableMatches = text.match(/ct_\w+/g);
  if (tableMatches) {
    entities.tables = [...new Set(tableMatches)];
  }

  // Detect known integrations
  const integrations = ["square", "outlook", "teams", "planner", "graph api", "openai", "power automate"];
  for (const integ of integrations) {
    if (text.includes(integ)) {
      entities.integrations.push(integ);
    }
  }

  // Detect flow references
  if (text.includes("flow")) {
    const flowMatch = text.match(/flow\s+["']?([^"',]+?)["']?(?:\s|$|,)/);
    if (flowMatch) entities.flows.push(flowMatch[1].trim());
  }

  // Detect screen/form references
  const screenWords = ["screen", "form", "dashboard", "page", "view"];
  for (const sw of screenWords) {
    if (text.includes(sw)) {
      const match = text.match(new RegExp(`${sw}\\s+["']?([^"',]+?)["']?(?:\\s|$|,)`));
      if (match) entities.screens.push(match[1].trim());
    }
  }

  return entities;
}

/**
 * Parse a plain-English command into a structured Bridge ticket.
 *
 * @param {string} rawCommand - The exact command as spoken or typed by Pat/Chad.
 * @param {Object} [options] - Optional overrides.
 * @param {string} [options.issuedBy="Pat"] - Who issued the command.
 * @param {string} [options.source="cli"]   - Where the command came from.
 * @returns {Object} Structured Bridge ticket matching command-schema.json.
 */
function parseCommand(rawCommand, options = {}) {
  const issuedBy = options.issuedBy || "Pat";
  const source = options.source || "cli";

  if (!rawCommand || typeof rawCommand !== "string" || rawCommand.trim().length === 0) {
    return {
      id: generateTicketId(),
      timestamp: new Date().toISOString(),
      issuedBy,
      source,
      rawCommand: rawCommand || "",
      commandType: "UNKNOWN",
      priority: "LOW",
      targetArea: "unknown",
      requestedAction: "Empty command — no action could be determined.",
      entities: { tables: [], flows: [], screens: [], fields: [], integrations: [] },
      constraints: [],
      dependencies: [],
      acceptanceCriteria: [],
      status: "UNKNOWN",
      recommendedNextStep: "Provide a clear command describing what you want built or changed.",
    };
  }

  const text = rawCommand.toLowerCase().trim();
  const commandType = classifyCommandType(text);
  const targetArea = classifyTargetArea(text);
  const priority = detectPriority(text);
  const entities = extractEntities(text);

  // Build a clear action summary
  const typeDef = commandTypes.commandTypes[commandType];
  const requestedAction = rawCommand.trim();

  // Build acceptance criteria from the command
  const acceptanceCriteria = [];
  if (commandType === "BUILD_FEATURE") {
    acceptanceCriteria.push("New feature is fully implemented with working code.");
    acceptanceCriteria.push("No existing functionality is broken.");
  } else if (commandType === "FIX_BUG") {
    acceptanceCriteria.push("The reported issue is resolved.");
    acceptanceCriteria.push("Existing tests still pass.");
  } else if (commandType === "CREATE_TABLE" || commandType === "UPDATE_TABLE") {
    acceptanceCriteria.push("Dataverse schema changes are documented.");
    acceptanceCriteria.push("Column-check tool confirms the changes.");
  }
  acceptanceCriteria.push("All changes are confirmed in the completion summary.");

  const ticket = {
    id: generateTicketId(),
    timestamp: new Date().toISOString(),
    issuedBy,
    source,
    rawCommand: rawCommand.trim(),
    commandType,
    priority,
    targetArea,
    requestedAction,
    entities,
    constraints: ["Do not break existing working files.", "Use Node.js CommonJS (require/module.exports)."],
    dependencies: [],
    acceptanceCriteria,
    status: commandType === "UNKNOWN" ? "UNKNOWN" : "NEW",
    recommendedNextStep: commandType === "UNKNOWN"
      ? "Clarify the command — what system area and what action is needed?"
      : `Execute ${commandType} targeting ${targetArea}.`,
  };

  return ticket;
}

module.exports = { parseCommand, generateTicketId, classifyCommandType, classifyTargetArea, detectPriority, extractEntities };
