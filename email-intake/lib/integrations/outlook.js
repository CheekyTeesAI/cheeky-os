"use strict";

const axios = require("axios");
const config = require("../config");

const RESEND_API = "https://api.resend.com/emails";

/** Verified sender for Resend (do not substitute noreply / unverified domains). */
const RESEND_FROM = "Cheeky Tees <customer.service@cheekyteesllc.com>";

/**
 * @param {unknown} body
 * @param {number} status
 */
function mapResendFailure(body, status) {
  const s =
    typeof body === "object" && body !== null ?
      JSON.stringify(body)
    : String(body ?? "");
  if (/domain|verify|not verified|validation_error/i.test(s)) {
    return "Resend domain not verified — use account email";
  }
  if (typeof body === "object" && body !== null && "message" in body) {
    return String(/** @type {{ message?: string }} */ (body).message || s);
  }
  return s || `HTTP ${status}`;
}

/**
 * @param {{
 *   to?: string,
 *   subject?: string,
 *   body?: string,
 *   cc?: string,
 *   bcc?: string
 * }} data
 * @returns {Promise<{
 *   success: boolean,
 *   mode: "live" | "stub",
 *   message: string,
 *   debug?: unknown,
 *   id?: string,
 *   stack?: string
 * }>}
 */
async function sendEmail(data) {
  const input = data && typeof data === "object" ? data : {};

  const toRaw = String(input.to || "").trim();
  const subjectRaw = String(input.subject || "Cheeky OS Message").trim();
  const bodyRaw = String(input.body || "").trim();
  const ccRaw = String(input.cc || "").trim();
  const bccRaw = String(input.bcc || "").trim();

  const fallbackMailbox = String(
    config.defaultFromEmail || "customer.service@cheekyteesllc.com"
  ).trim();

  let to = toRaw;
  if (!to) {
    to = fallbackMailbox;
  }

  if (config.hasResend()) {
    console.log("📤 Sending email:", { to, subject: subjectRaw });

    const splitList = (s) =>
      s
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean);

    const payload = {
      from: RESEND_FROM,
      to: splitList(to).length ? splitList(to) : [fallbackMailbox],
      subject: subjectRaw || "Cheeky OS Message",
      text: bodyRaw,
    };
    if (ccRaw) {
      /** @type {{ cc?: string[] }} */ (payload).cc = splitList(ccRaw);
    }
    if (bccRaw) {
      /** @type {{ bcc?: string[] }} */ (payload).bcc = splitList(bccRaw);
    }

    try {
      const res = await axios.post(RESEND_API, payload, {
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 45000,
        validateStatus: () => true,
      });

      if (res.status >= 200 && res.status < 300) {
        const id =
          res.data && typeof res.data === "object" && res.data !== null ?
            /** @type {{ id?: string }} */ (res.data).id
          : undefined;
        return {
          success: true,
          mode: "live",
          message: "Email sent via Resend",
          ...(id ? { id } : {}),
        };
      }

      let friendly = mapResendFailure(res.data, res.status);
      const errBlob = friendly + JSON.stringify(res.data);

      if (/from|invalid.*sender|sender/i.test(errBlob)) {
        console.log("📤 Retrying email with plain from address");
        const res2 = await axios.post(
          RESEND_API,
          { ...payload, from: "customer.service@cheekyteesllc.com" },
          {
            headers: {
              Authorization: `Bearer ${config.resendApiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 45000,
            validateStatus: () => true,
          }
        );
        if (res2.status >= 200 && res2.status < 300) {
          return {
            success: true,
            mode: "live",
            message: "Email sent via Resend (from address fallback)",
          };
        }
        friendly = mapResendFailure(res2.data, res2.status);
      }

      return {
        success: false,
        mode: "live",
        error: "EMAIL_FAILED",
        message: friendly,
        hint: "Check domain verification in Resend",
      };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[outlook] Resend sendEmail", e.message);
      let msg = mapResendFailure(e.message, 0);
      if (/network|ECONNREFUSED|timeout/i.test(e.message)) {
        msg = e.message;
      }
      return {
        success: false,
        mode: "live",
        error: "EMAIL_FAILED",
        message: msg,
        hint: "Check domain verification in Resend",
        stack: e.stack,
      };
    }
  }

  if (!config.hasOutlookWebhook) {
    return {
      success: true,
      mode: "stub",
      message:
        "Resend not configured (RESEND_API_KEY) and Outlook webhook not set",
      debug: input,
    };
  }

  const url = String(config.outlookWebhook || "").trim();
  if (!url) {
    return {
      success: true,
      mode: "stub",
      message: "Outlook webhook not configured",
      debug: input,
    };
  }

  const webhookPayload = {
    to: to || "",
    subject: subjectRaw || "Cheeky OS Message",
    body: bodyRaw || "",
    cc: ccRaw || "",
    bcc: bccRaw || "",
  };

  console.log("📤 Sending email (webhook):", {
    to: webhookPayload.to,
    subject: webhookPayload.subject,
  });

  try {
    const res = await axios.post(url, webhookPayload, {
      headers: { "Content-Type": "application/json" },
      timeout: 45000,
      validateStatus: () => true,
    });
    const ok = res.status >= 200 && res.status < 300;
    if (ok) {
      return {
        success: true,
        mode: "live",
        message: "Email sent via Outlook webhook",
      };
    }
    return {
      success: false,
      mode: "live",
      message: `HTTP ${res.status}`,
    };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[outlook] webhook sendEmail", e.message);
    return {
      success: false,
      mode: "live",
      message: e.message,
      stack: e.stack,
    };
  }
}

module.exports = {
  sendEmail,
};
