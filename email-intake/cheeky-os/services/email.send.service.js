"use strict";

/**
 * PHASE 1 — Email Send Service (Resend)
 *
 * Wraps Resend SDK for outbound email.
 * Falls back to simulated send if RESEND_API_KEY is not configured.
 *
 * SUPREME LAWS:
 *   - Never auto-send (callers must explicitly call sendEmail)
 *   - Never crash the app — all errors return { success: false }
 *   - Log every attempt
 *   - No duplicate sends (enforced by caller via draft status check)
 */

const FROM_ADDRESS = process.env.RESEND_FROM || "Cheeky Tees <hello@cheekytees.com>";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

// ─── Resend client (lazy-init) ────────────────────────────────────────────────
let _resendClient = null;

function getResendClient() {
  if (_resendClient) return _resendClient;
  if (!RESEND_API_KEY) return null;
  try {
    const { Resend } = require("resend");
    _resendClient = new Resend(RESEND_API_KEY);
    return _resendClient;
  } catch (err) {
    console.warn("[email.send] Resend SDK unavailable:", err && err.message ? err.message : err);
    return null;
  }
}

/**
 * Convert plain-text body to basic HTML for Resend.
 * Preserves line breaks and indentation.
 */
function toHtml(body) {
  return `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:600px">
${String(body || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .map((line) => `<p style="margin:0 0 6px">${line || "&nbsp;"}</p>`)
    .join("\n")}
</div>`;
}

/**
 * Send an email via Resend.
 * Falls back to simulated send if key is missing.
 *
 * @param {object} opts
 * @param {string} opts.to        - Recipient email address
 * @param {string} opts.subject   - Email subject
 * @param {string} opts.body      - Plain-text body (auto-converted to HTML)
 * @param {string} [opts.from]    - Override sender (defaults to RESEND_FROM env)
 * @param {string} [opts.replyTo] - Reply-to address
 * @returns {Promise<{success: boolean, messageId: string|null, mode: string, error?: string}>}
 */
async function sendEmail(opts) {
  const { to, subject, body, from, replyTo } = opts || {};

  if (!to || !subject || !body) {
    return { success: false, messageId: null, mode: "blocked", error: "Missing required fields: to, subject, body." };
  }

  // ── Resend send ────────────────────────────────────────────────────────────
  const client = getResendClient();

  if (client) {
    try {
      const payload = {
        from: from || FROM_ADDRESS,
        to: [to],
        subject,
        html: toHtml(body),
        text: body,
        ...(replyTo ? { replyTo } : {}),
      };
      const result = await client.emails.send(payload);
      const messageId = (result && result.data && result.data.id) || (result && result.id) || null;

      console.log(`[email.send] RESEND ✓ to=${to} subject="${subject}" id=${messageId}`);
      return { success: true, messageId, mode: "resend" };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      console.error(`[email.send] RESEND ✗ to=${to}: ${msg}`);
      return { success: false, messageId: null, mode: "resend", error: msg };
    }
  }

  // ── Simulated fallback (no API key) ────────────────────────────────────────
  const simulatedId = `sim-${Date.now()}`;
  console.log(`[email.send] SIMULATED (no RESEND_API_KEY) to=${to} subject="${subject}"`);
  return {
    success: true,
    messageId: simulatedId,
    mode: "simulated",
    warning: "RESEND_API_KEY not configured — email was NOT actually sent.",
  };
}

/**
 * Check whether real sending is configured.
 */
function getSendMode() {
  return {
    configured: Boolean(RESEND_API_KEY),
    mode: RESEND_API_KEY ? "resend" : "simulated",
    from: FROM_ADDRESS,
  };
}

module.exports = { sendEmail, getSendMode };
