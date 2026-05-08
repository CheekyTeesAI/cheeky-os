"use strict";

/**
 * PHASE 2 — Communication Log
 * Log of every email attempt (sent + failed) with optional JSON persistence.
 *
 * SUPREME LAW: Every message attempt must be logged — success or failure.
 */

const crypto = require("crypto");
const { loadJson, saveJson } = require("./json.queue.persistence.service");

const FILE = "communication-logs.json";
const MAX_LOGS = 2000;

let logs = [];

function persist() {
  const slice = logs.length > MAX_LOGS ? logs.slice(-MAX_LOGS) : logs;
  saveJson(FILE, slice);
}

function hydrate() {
  const blob = loadJson(FILE, null);
  if (Array.isArray(blob)) {
    logs = blob;
  }
}

hydrate();

/**
 * Log a communication attempt.
 * @param {object} entry
 * @returns {object} Saved log entry with id and timestamp.
 */
function logMessage(entry) {
  const id = `log-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const saved = {
    id,
    timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
    // Who
    customerName: entry.customerName || "",
    email: entry.email || entry.to || "",
    // What
    invoiceId: entry.invoiceId || "",
    draftId: entry.draftId || "",
    orderId: entry.orderId || "",
    subject: entry.subject || "",
    body: entry.body || "",
    // Result
    status: entry.status || "unknown",  // sent | failed | simulated
    messageId: entry.messageId || null,
    mode: entry.mode || "unknown",       // resend | simulated
    error: entry.error || null,
    // Phase 6 — response-ready structure
    threadId: entry.threadId || null,
    replied: false,
    repliedAt: null,
    replyBody: null,
  };

  logs.push(saved);
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(-MAX_LOGS);
  }
  persist();
  return saved;
}

/**
 * Get all logs, optionally filtered by status.
 * @param {string} [statusFilter] - "sent" | "failed" | "simulated" | undefined (all)
 * @returns {object[]}
 */
function getLogs(statusFilter) {
  if (statusFilter) return logs.filter((l) => l.status === statusFilter);
  return [...logs];
}

/**
 * Get a single log entry by id.
 * @param {string} id
 */
function getLogById(id) {
  return logs.find((l) => l.id === id) || null;
}

/**
 * Mark a log entry as replied (for future inbound email parsing).
 * @param {string} id
 * @param {object} reply - { body, threadId }
 */
function markReplied(id, reply) {
  const entry = logs.find((l) => l.id === id);
  if (!entry) return null;
  entry.replied = true;
  entry.repliedAt = new Date().toISOString();
  entry.replyBody = (reply && reply.body) || null;
  entry.threadId = (reply && reply.threadId) || entry.threadId;
  persist();
  return entry;
}

/**
 * Get summary counts.
 */
function getSummary() {
  return {
    total: logs.length,
    sent: logs.filter((l) => l.status === "sent").length,
    failed: logs.filter((l) => l.status === "failed").length,
    simulated: logs.filter((l) => l.status === "simulated" || l.mode === "simulated").length,
    replied: logs.filter((l) => l.replied).length,
  };
}

module.exports = { logMessage, getLogs, getLogById, markReplied, getSummary };
