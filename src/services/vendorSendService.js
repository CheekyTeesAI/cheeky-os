/**
 * Vendor PO email send — PREVIEW vs SEND; never reports sent unless provider confirms.
 */
const { sendEmail } = require("./emailService");

/**
 * @param {object} opts
 * @param {object} opts.vendor
 * @param {{ subject: string, body: string, attachments?: Array<{ path: string, filename?: string, type?: string }> }} opts.composedEmail
 * @param {"PREVIEW"|"SEND"} opts.mode
 */
async function sendVendorEmail({ vendor, composedEmail, mode }) {
  const v = vendor || {};
  const to = String(v.email || "").trim();
  const m = String(mode || "PREVIEW").toUpperCase();
  const ce = composedEmail || {};
  const subject = String(ce.subject || "");
  const body = String(ce.body || "");
  const attachments = Array.isArray(ce.attachments) ? ce.attachments : [];

  if (m === "PREVIEW") {
    return {
      mode: "PREVIEW",
      success: true,
      sent: false,
      preview: {
        to: to || null,
        subject,
        body,
        attachmentCount: attachments.length,
        attachmentNames: attachments.map((a) => a && a.filename).filter(Boolean),
      },
      provider: null,
      error: null,
      messageId: null,
      mock: false,
    };
  }

  if (m !== "SEND") {
    return {
      mode: m,
      success: false,
      sent: false,
      preview: null,
      provider: null,
      error: "invalid_mode",
      messageId: null,
      mock: true,
    };
  }

  if (!to) {
    return {
      mode: "SEND",
      success: false,
      sent: false,
      preview: null,
      provider: null,
      error: `Missing vendor email for ${v.name || v.vendorKey || "vendor"} — set env (e.g. CAROLINA_MADE_EMAIL) or configure profile.`,
      messageId: null,
      mock: true,
    };
  }

  const result = await sendEmail({ to, subject, body, attachments });
  const confirmed = Boolean(result && result.success && !result.mock && result.id);
  return {
    mode: "SEND",
    success: Boolean(result && result.success),
    sent: confirmed,
    preview: null,
    provider: result && result.provider ? result.provider : "resend",
    error:
      confirmed || (result && result.success)
        ? null
        : String((result && result.reason) || (result && result.error) || "send_failed"),
    messageId: confirmed ? String(result.id) : null,
    mock: Boolean(result && result.mock),
  };
}

module.exports = {
  sendVendorEmail,
};
