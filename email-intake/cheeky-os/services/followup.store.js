"use strict";

/**
 * PHASE 3 — Follow-Up Draft Storage
 * In-memory store for draft follow-up messages.
 * Drafts persist for the server's lifetime; no DB required.
 * All drafts start as "draft" — nothing is sent without explicit approval.
 */

const crypto = require("crypto");
const { loadJson, saveJson } = require("./json.queue.persistence.service");

let drafts = [];
/** Follow-up history: last contact per invoice */
let history = {};

function serializeHistory(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    out[k] = {
      ...v,
      lastFollowUp:
        v.lastFollowUp instanceof Date
          ? v.lastFollowUp.toISOString()
          : v.lastFollowUp || null,
      firstFollowUp:
        v.firstFollowUp instanceof Date
          ? v.firstFollowUp.toISOString()
          : v.firstFollowUp || null,
    };
  }
  return out;
}

function deserializeHistory(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[k] = {
      ...v,
      lastFollowUp: v.lastFollowUp ? new Date(v.lastFollowUp) : null,
      firstFollowUp: v.firstFollowUp ? new Date(v.firstFollowUp) : null,
    };
  }
  return out;
}

function persistDrafts() {
  saveJson("followup-drafts.json", { drafts });
}

function persistHistory() {
  saveJson("followup-history.json", { history: serializeHistory(history) });
}

function hydrateFromDisk() {
  const draftBlob = loadJson("followup-drafts.json", null);
  if (draftBlob && Array.isArray(draftBlob.drafts)) {
    drafts = draftBlob.drafts;
  }
  const histBlob = loadJson("followup-history.json", null);
  if (histBlob && histBlob.history && typeof histBlob.history === "object") {
    history = deserializeHistory(histBlob.history);
  }
}

hydrateFromDisk();

/**
 * Generate a unique draft ID.
 */
function generateId() {
  return `fu-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * Save a new draft to the store.
 * @param {object} draft
 * @returns {object} Saved draft with id, status, and timestamps.
 */
function saveDraft(draft) {
  const saved = {
    id: draft.id || generateId(),
    status: "draft",
    createdAt: new Date().toISOString(),
    sentAt: null,
    // Invoice fields
    customerName: draft.customerName || "",
    email: draft.email || draft.to || "",
    phone: draft.phone || "",
    amount: draft.amount || 0,
    daysOutstanding: draft.daysOutstanding || 0,
    invoiceId: draft.invoiceId || "",
    orderId: draft.orderId || "",
    source: draft.source || "unknown",
    // Message fields
    subject: draft.subject || "",
    body: draft.body || "",
    tone: draft.tone || "friendly",
    to: draft.to || draft.email || "",
  };

  // Deduplicate by invoiceId (replace existing draft for same invoice)
  const idx = drafts.findIndex((d) => d.invoiceId && d.invoiceId === saved.invoiceId && d.status === "draft");
  if (idx >= 0) {
    drafts[idx] = { ...drafts[idx], ...saved, id: drafts[idx].id };
    persistDrafts();
    return drafts[idx];
  }

  drafts.push(saved);
  persistDrafts();
  return saved;
}

/**
 * Get all drafts (optionally filter by status).
 * @param {string} [statusFilter] - "draft" | "sent" | "approved" | undefined (all)
 * @returns {object[]}
 */
function getDrafts(statusFilter) {
  if (statusFilter) return drafts.filter((d) => d.status === statusFilter);
  return [...drafts];
}

/**
 * Get a single draft by ID.
 * @param {string} id
 * @returns {object|null}
 */
function getDraftById(id) {
  return drafts.find((d) => d.id === id) || null;
}

/**
 * Update a draft's status (e.g., draft → approved → sent).
 * @param {string} id
 * @param {object} updates
 * @returns {object|null}
 */
function updateDraft(id, updates) {
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  drafts[idx] = { ...drafts[idx], ...updates };
  persistDrafts();
  return drafts[idx];
}

/**
 * Clear all drafts (for testing).
 */
function clearDrafts() {
  drafts = [];
  persistDrafts();
}

/**
 * Get store summary counts.
 */
function getSummary() {
  return {
    total: drafts.length,
    draft: drafts.filter((d) => d.status === "draft").length,
    approved: drafts.filter((d) => d.status === "approved").length,
    sent: drafts.filter((d) => d.status === "sent").length,
  };
}

// ─── Follow-Up History (Phase 1 — Auto Cash System) ───────────────────────────
// Tracks when each invoice last received a follow-up to prevent spam.

/**
 * Record that a follow-up was generated for an invoice.
 * @param {string} invoiceId
 */
function updateHistory(invoiceId) {
  if (!invoiceId) return;
  const existing = history[invoiceId];
  history[invoiceId] = {
    invoiceId,
    lastFollowUp: new Date(),
    followUpCount: existing ? existing.followUpCount + 1 : 1,
    firstFollowUp: existing ? existing.firstFollowUp : new Date(),
  };
  persistHistory();
}

/**
 * Get the follow-up history for an invoice.
 * @param {string} invoiceId
 * @returns {{ invoiceId, lastFollowUp: Date, followUpCount: number } | null}
 */
function getHistory(invoiceId) {
  return history[invoiceId] || null;
}

/**
 * Check if an invoice is eligible for a new follow-up (48-hour cooldown).
 * @param {string} invoiceId
 * @param {number} [cooldownHours=48]
 * @returns {boolean}
 */
function isFollowUpEligible(invoiceId, cooldownHours) {
  const cooldown = (cooldownHours || 48) * 60 * 60 * 1000;
  const record = history[invoiceId];
  if (!record || !record.lastFollowUp) return true;
  return Date.now() - new Date(record.lastFollowUp).getTime() >= cooldown;
}

/**
 * Get all history entries.
 */
function getAllHistory() {
  return { ...history };
}

/**
 * Clear history (testing only).
 */
function clearHistory() {
  history = {};
  persistHistory();
}

module.exports = {
  saveDraft, getDrafts, getDraftById, updateDraft, clearDrafts, getSummary,
  updateHistory, getHistory, isFollowUpEligible, getAllHistory, clearHistory,
};
