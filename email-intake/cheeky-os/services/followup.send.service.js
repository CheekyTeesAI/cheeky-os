"use strict";

/**
 * Follow-Up Send Service — upgraded with Resend + Communication Log
 *
 * SUPREME LAWS:
 *   - NEVER AUTO-SEND — explicit draftId required from operator
 *   - No duplicate sends — draft.status === "sent" check is the gate
 *   - Every attempt logged (success + failure)
 *   - Never crash the app
 */

const store      = require("./followup.store");
const emailSvc   = require("./email.send.service");
const commsLog   = require("./communication.log");

/**
 * Send a single draft by ID.
 * Requires draft to exist and not already be sent.
 *
 * @param {string} draftId
 * @param {object} [options]
 * @param {string} [options.approvedBy]
 * @returns {Promise<object>}
 */
async function sendDraft(draftId, options) {
  const approvedBy = (options && options.approvedBy) || "operator";

  // ── Gate: draft must exist ─────────────────────────────────────────────────
  const draft = store.getDraftById(draftId);
  if (!draft) {
    return { ok: false, draftId, status: "not_found", message: `Draft ${draftId} not found.` };
  }

  // ── Gate: no duplicate sends ───────────────────────────────────────────────
  if (draft.status === "sent") {
    return { ok: false, draftId, status: "already_sent", message: `Draft ${draftId} was already sent. No duplicate.` };
  }

  const to = draft.to || draft.email || "";
  const sentAt = new Date().toISOString();

  // ── Attempt real send via Resend (falls back to simulated if unconfigured) ─
  let emailResult = { success: false, mode: "blocked", error: "No email address." };

  if (to) {
    try {
      emailResult = await emailSvc.sendEmail({
        to,
        subject: draft.subject,
        body: draft.body,
      });
    } catch (err) {
      emailResult = { success: false, mode: "error", error: err && err.message ? err.message : String(err) };
    }
  }

  // ── Update draft status ────────────────────────────────────────────────────
  const newStatus = emailResult.success ? "sent" : "failed";
  store.updateDraft(draftId, {
    status: newStatus,
    sentAt: emailResult.success ? sentAt : null,
    sentBy: approvedBy,
    sendMode: emailResult.mode,
    messageId: emailResult.messageId || null,
    sendError: emailResult.error || null,
  });

  // ── Log every attempt (Phase 2 + Phase 6 structure) ───────────────────────
  commsLog.logMessage({
    draftId,
    invoiceId: draft.invoiceId,
    orderId: draft.orderId,
    customerName: draft.customerName,
    email: to,
    subject: draft.subject,
    body: draft.body,
    status: newStatus,
    messageId: emailResult.messageId || null,
    mode: emailResult.mode,
    error: emailResult.error || null,
    // Phase 6 — response-ready
    threadId: emailResult.messageId || null,
    replied: false,
  });

  return {
    ok: emailResult.success,
    draftId,
    status: newStatus,
    mode: emailResult.mode,
    to,
    customerName: draft.customerName,
    subject: draft.subject,
    messageId: emailResult.messageId || null,
    sentAt: emailResult.success ? sentAt : null,
    error: emailResult.error || null,
    warning: emailResult.warning || null,
  };
}

/**
 * Approve a draft without sending yet.
 * @param {string} draftId
 * @param {string} [approvedBy]
 */
function approveDraft(draftId, approvedBy) {
  const draft = store.getDraftById(draftId);
  if (!draft) return { ok: false, error: `Draft ${draftId} not found.` };
  if (draft.status === "sent") return { ok: false, error: "Already sent." };

  const updated = store.updateDraft(draftId, {
    status: "approved",
    approvedAt: new Date().toISOString(),
    approvedBy: approvedBy || "operator",
  });
  return { ok: true, draft: updated };
}

/**
 * Get legacy send log (maintained for backward compatibility).
 * Now delegates to communication log.
 */
function getSendLog() {
  return commsLog.getLogs();
}

module.exports = { sendDraft, approveDraft, getSendLog };
