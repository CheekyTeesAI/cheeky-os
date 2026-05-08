"use strict";

/**
 * PHASE 1 — Inbound message store (in-memory + JSON persistence)
 * Every customer reply lands here first. NO auto-reply.
 */

const { loadJson, saveJson } = require("./json.queue.persistence.service");

const FILE = "inbound-messages.json";

let inboundMessages = [];

function persist() {
  saveJson(FILE, { messages: inboundMessages });
}

function hydrate() {
  const blob = loadJson(FILE, null);
  if (blob && Array.isArray(blob.messages)) {
    inboundMessages = blob.messages;
  }
}

hydrate();

/**
 * @param {object} message
 * @returns {object}
 */
function saveInbound(message) {
  const entry = {
    id: `in_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    from: message.from || null,
    subject: message.subject || "",
    body: message.body || "",
    receivedAt: new Date().toISOString(),
    matchedInvoiceId: null,
    matchedCustomerName: null,
    opportunityType: null,
    aiReplyDraft: null,
    matchConfidence: null,
    status: "new",
  };

  inboundMessages.push(entry);
  persist();
  return entry;
}

/**
 * Patch an existing inbound by id (after matching / AI draft).
 * @param {string} id
 * @param {object} patch
 * @returns {object|null}
 */
function updateInbound(id, patch) {
  const idx = inboundMessages.findIndex((m) => m.id === id);
  if (idx < 0) return null;
  inboundMessages[idx] = { ...inboundMessages[idx], ...patch };
  persist();
  return inboundMessages[idx];
}

/**
 * @returns {object[]}
 */
function getInboundMessages() {
  return [...inboundMessages];
}

/**
 * @param {string} id
 * @returns {object|null}
 */
function getInboundById(id) {
  return inboundMessages.find((m) => m.id === id) || null;
}

module.exports = {
  saveInbound,
  getInboundMessages,
  updateInbound,
  getInboundById,
};
