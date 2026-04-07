/**
 * Bundle 22 — batched alert email via Resend (same env pattern as marketing/reactivation.js).
 */

const SUBJECT = "Cheeky OS Alerts — Action Needed";

/**
 * Recipient: env first, no hardcoded real address (avoid leaking PII in repo).
 * @returns {string}
 */
function getAlertRecipient() {
  return String(
    process.env.CHEEKY_ALERT_EMAIL ||
      process.env.CHEEKY_OS_ALERT_EMAIL ||
      process.env.OUTLOOK_USER_EMAIL ||
      process.env.NOTIFY_EMAIL ||
      ""
  ).trim();
}

/**
 * @param {string} sev
 */
function sevLabel(sev) {
  return String(sev || "")
    .trim()
    .toUpperCase();
}

/**
 * @param {{ type?: string, message?: string, severity?: string }[]} alerts
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendAlertSummary(alerts) {
  const list = Array.isArray(alerts) ? alerts : [];
  const key = String(process.env.RESEND_API_KEY || "").trim();
  const from = (
    process.env.RESEND_FROM || "Cheeky Tees <onboarding@resend.dev>"
  ).trim();
  const to = getAlertRecipient();

  if (!key) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  if (!to) {
    return {
      ok: false,
      error:
        "Set CHEEKY_ALERT_EMAIL (or CHEEKY_OS_ALERT_EMAIL / OUTLOOK_USER_EMAIL / NOTIFY_EMAIL)",
    };
  }

  const lines = list.map((a) => {
    const msg = String((a && a.message) || "").trim() || "(no message)";
    const s = sevLabel(a && a.severity);
    return `- [${s}] ${msg}`;
  });

  const body =
    "You have important updates:\n\n" +
    lines.join("\n") +
    "\n\nCheck your dashboard to take action.\n\n— Cheeky OS";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: SUBJECT,
      text: body,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: txt.slice(0, 400) };
  }
  return { ok: true };
}

module.exports = { sendAlertSummary, getAlertRecipient };
