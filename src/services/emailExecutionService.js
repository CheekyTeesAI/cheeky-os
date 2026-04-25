/**
 * Resend-backed email send — PREVIEW never hits network.
 */

async function sendEmailCommunication({ to, subject, body, mode }) {
  const m = String(mode || "PREVIEW").toUpperCase();
  const recipient = String(to || "").trim();
  const subj = String(subject || "").trim() || "(no subject)";
  const text = String(body || "");

  const preview = {
    to: recipient,
    subject: subj,
    body: text,
  };

  if (m === "PREVIEW") {
    return {
      mode: "PREVIEW",
      success: true,
      sent: false,
      provider: "resend",
      providerMessageId: null,
      preview,
      error: null,
    };
  }

  const key = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.RESEND_FROM || "Cheeky Tees <onboarding@resend.dev>").trim();

  if (!key) {
    return {
      mode: "SEND",
      success: false,
      sent: false,
      provider: "resend",
      providerMessageId: null,
      preview,
      error: "RESEND_API_KEY not set — cannot send email",
    };
  }
  if (!recipient || !recipient.includes("@")) {
    return {
      mode: "SEND",
      success: false,
      sent: false,
      provider: "resend",
      providerMessageId: null,
      preview,
      error: "valid recipient email required",
    };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: subj,
        text,
      }),
    });
    const raw = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_e) {
      parsed = { raw: raw.slice(0, 400) };
    }
    if (!res.ok) {
      return {
        mode: "SEND",
        success: false,
        sent: false,
        provider: "resend",
        providerMessageId: null,
        preview,
        error: `resend_http_${res.status}: ${raw.slice(0, 400)}`,
      };
    }
    const mid = parsed && (parsed.id || parsed.data?.id) ? String(parsed.id || parsed.data.id) : null;
    return {
      mode: "SEND",
      success: true,
      sent: true,
      provider: "resend",
      providerMessageId: mid,
      preview,
      error: null,
    };
  } catch (e) {
    return {
      mode: "SEND",
      success: false,
      sent: false,
      provider: "resend",
      providerMessageId: null,
      preview,
      error: e && e.message ? e.message : "resend_fetch_failed",
    };
  }
}

module.exports = { sendEmailCommunication };
