"use strict";

const { handler: handleGetLastEmail } = require("./tools/getLastEmailFromContact");
const { RISK_LEVEL } = require("./approvalGate");

/**
 * @typedef {object} RegisteredTool
 * @property {string} name
 * @property {string} description
 * @property {"READ_ONLY"|"APPROVAL_REQUIRED"|"DANGEROUS"} riskLevel
 * @property {string[]} requiredEnvVars
 * @property {(params: object, context?: object) => Promise<object>} handler
 * @property {boolean} enabled
 */

/** @type {Record<string, RegisteredTool>} */
const tools = {
  getLastEmailFromContact: {
    name: "getLastEmailFromContact",
    description:
      "Retrieve the latest email for a contact (name or address). Phase 1 returns NOT_CONFIGURED / NOT_IMPLEMENTED until Graph/Gmail fetch is built.",
    riskLevel: RISK_LEVEL.READ_ONLY,
    requiredEnvVars: [
      "MS_GRAPH_TENANT_ID",
      "MS_GRAPH_CLIENT_ID",
      "MS_GRAPH_CLIENT_SECRET",
      "MS_GRAPH_MAILBOX_USER",
      "GMAIL_CLIENT_ID",
      "GMAIL_CLIENT_SECRET",
      "GMAIL_REFRESH_TOKEN",
    ],
    handler: handleGetLastEmail,
    enabled: true,
  },
};

function getTool(name) {
  return tools[name] || null;
}

function listTools() {
  return Object.values(tools).map((t) => ({
    name: t.name,
    description: t.description,
    riskLevel: t.riskLevel,
    requiredEnvVars: t.requiredEnvVars,
    enabled: t.enabled,
  }));
}

module.exports = { tools, getTool, listTools };
