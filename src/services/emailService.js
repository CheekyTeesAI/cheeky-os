/**
 * Resend-backed email helpers (additive; degrades when RESEND_API_KEY missing).
 */
const fs = require("fs");
const path = require("path");

const RESEND_URL = "https://api.resend.com/emails";

function getFrom() {
  return String(process.env.RESEND_FROM || "Cheeky Tees <customer.service@cheekyteesllc.com>").trim();
}

function readAttachment(absPath, filename) {
  const buf = fs.readFileSync(absPath);
  return {
    filename: filename || path.basename(absPath),
    content: buf.toString("base64"),
  };
}

/**
 * Send work order email with one or more attachments (Resend API).
 *
 * @param {object} opts
 * @param {string} [opts.to] - recipient (defaults to BULLSEYE_EMAIL)
 * @param {string} opts.subject
 * @param {string} opts.body
 * @param {string} [opts.attachmentPath] - legacy single PDF
 * @param {string} [opts.filename] - legacy filename for single attachment
 * @param {Array<{ path: string, filename?: string }>} [opts.attachments]
 */
async function sendWorkOrderEmail({ to, subject, body, attachmentPath, filename, attachments }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const recipient = String(to || process.env.BULLSEYE_EMAIL || "").trim();
  if (!recipient) {
    return { success: false, mock: true, reason: "recipient_required" };
  }
  if (!apiKey) {
    console.warn("[emailService] RESEND_API_KEY missing — email not sent");
    return { success: false, mock: true, reason: "RESEND_API_KEY missing" };
  }

  const list = [];
  if (Array.isArray(attachments) && attachments.length) {
    for (const a of attachments) {
      if (!a || !a.path) continue;
      try {
        list.push(readAttachment(a.path, a.filename));
      } catch (e) {
        return {
          success: false,
          mock: true,
          reason: e && e.message ? e.message : "attachment_read_failed",
        };
      }
    }
  }
  if (list.length === 0 && attachmentPath) {
    try {
      list.push(readAttachment(attachmentPath, filename));
    } catch (e) {
      return {
        success: false,
        mock: true,
        reason: e && e.message ? e.message : "attachment_read_failed",
      };
    }
  }
  if (list.length === 0) {
    return { success: false, mock: true, reason: "no_attachments" };
  }

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFrom(),
        to: [recipient],
        subject: String(subject || "Work order"),
        text: String(body || ""),
        attachments: list,
      }),
    });
    const detail = await response.text();
    if (!response.ok) {
      console.warn("[emailService] Resend error:", response.status, detail.slice(0, 300));
      return { success: false, mock: true, reason: `resend_http_${response.status}`, detail: detail.slice(0, 500) };
    }
    let data = {};
    try {
      data = JSON.parse(detail || "{}");
    } catch (_e) {
      data = {};
    }
    return {
      success: true,
      mock: false,
      provider: "resend",
      id: data.id || null,
      attachmentCount: list.length,
    };
  } catch (error) {
    console.warn("[emailService] send failed:", error && error.message ? error.message : error);
    return { success: false, mock: true, reason: error && error.message ? error.message : "send_failed" };
  }
}

/**
 * General outbound email — attachments optional (body-only allowed).
 */
async function sendEmail({ to, subject, body, attachments }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const recipient = String(to || "").trim();
  if (!recipient) {
    return { success: false, mock: true, reason: "recipient_required" };
  }
  if (!apiKey) {
    console.warn("[emailService] RESEND_API_KEY missing — email not sent");
    return { success: false, mock: true, reason: "RESEND_API_KEY missing" };
  }

  const list = [];
  if (Array.isArray(attachments) && attachments.length) {
    for (const a of attachments) {
      if (!a || !a.path) continue;
      try {
        list.push(readAttachment(a.path, a.filename));
      } catch (e) {
        return {
          success: false,
          mock: true,
          reason: e && e.message ? e.message : "attachment_read_failed",
        };
      }
    }
  }

  try {
    const payload = {
      from: getFrom(),
      to: [recipient],
      subject: String(subject || "Message"),
      text: String(body || ""),
    };
    if (list.length) payload.attachments = list;

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const detail = await response.text();
    if (!response.ok) {
      console.warn("[emailService] Resend error:", response.status, detail.slice(0, 300));
      return { success: false, mock: true, reason: `resend_http_${response.status}`, detail: detail.slice(0, 500) };
    }
    let data = {};
    try {
      data = JSON.parse(detail || "{}");
    } catch (_e) {
      data = {};
    }
    return {
      success: true,
      mock: false,
      provider: "resend",
      id: data.id || null,
      sent: true,
      attachmentCount: list.length,
    };
  } catch (error) {
    console.warn("[emailService] send failed:", error && error.message ? error.message : error);
    return { success: false, mock: true, reason: error && error.message ? error.message : "send_failed" };
  }
}

module.exports = {
  sendWorkOrderEmail,
  sendEmail,
  getFrom,
};
