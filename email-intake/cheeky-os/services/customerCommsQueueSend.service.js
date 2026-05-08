"use strict";

/**
 * Optional send for operator-approved queue rows only.
 * No Resend key → { ok:false } (no simulated send).
 */

const path = require("path");

function loadEmailSend() {
  try {
    return require(path.join(__dirname, "email.send.service.js"));
  } catch (_) {
    return null;
  }
}

/**
 * @param {{ toAddress: string, subject: string|null, textBody: string }} row
 * @returns {Promise<{ ok: boolean, messageId?: string|null, error?: string }>}
 */
async function sendApprovedQueueEmail(row) {
  const key = String(process.env.RESEND_API_KEY || "").trim();
  if (!key) {
    return { ok: false, error: "No sender configured" };
  }
  const to = String(row.toAddress || "").trim();
  if (!to || to === "pending-recipient@local.invalid") {
    return { ok: false, error: "No valid recipient" };
  }
  const mod = loadEmailSend();
  if (!mod || typeof mod.sendEmail !== "function") {
    return { ok: false, error: "No sender configured" };
  }
  const subject = String(row.subject || "").trim() || "(no subject)";
  const body = String(row.textBody || "").trim();
  if (!body) return { ok: false, error: "Empty body" };

  const res = await mod.sendEmail({ to, subject, body });
  if (!res.success) {
    return { ok: false, error: res.error || "send_failed" };
  }
  if (res.mode === "simulated") {
    return { ok: false, error: "No sender configured" };
  }
  return { ok: true, messageId: res.messageId || null };
}

module.exports = { sendApprovedQueueEmail };
