/**
 * Twilio SMS — PREVIEW never hits network.
 */

function toE164(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  if (d.length >= 10 && phone && String(phone).trim().startsWith("+")) return "+" + d;
  return d.length >= 10 ? "+" + d : "";
}

async function sendSMSCommunication({ to, body, mode }) {
  const m = String(mode || "PREVIEW").toUpperCase();
  const dest = toE164(to);
  const text = String(body || "").trim();

  const preview = { to: dest, body: text };

  if (m === "PREVIEW") {
    return {
      mode: "PREVIEW",
      success: true,
      sent: false,
      provider: "twilio",
      providerMessageId: null,
      preview,
      error: null,
    };
  }

  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(
    process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_NUMBER || ""
  ).trim();

  if (!sid || !token) {
    return {
      mode: "SEND",
      success: false,
      sent: false,
      provider: "twilio",
      providerMessageId: null,
      preview,
      error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — cannot send SMS",
    };
  }
  if (!from) {
    return {
      mode: "SEND",
      success: false,
      sent: false,
      provider: "twilio",
      providerMessageId: null,
      preview,
      error: "TWILIO_FROM (or TWILIO_PHONE_NUMBER) not set — cannot send SMS",
    };
  }
  if (!dest || dest.length < 12) {
    return {
      mode: "SEND",
      success: false,
      sent: false,
      provider: "twilio",
      providerMessageId: null,
      preview,
      error: "valid E.164 customer phone required",
    };
  }

  const params = new URLSearchParams({ To: dest, From: from, Body: text.slice(0, 1600) });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: params.toString(),
    });
    const raw = await res.text();
    let sidMsg = null;
    try {
      const j = JSON.parse(raw);
      sidMsg = j.sid || j.message_sid || null;
    } catch (_e) {
      /* ignore */
    }
    if (!res.ok) {
      return {
        mode: "SEND",
        success: false,
        sent: false,
        provider: "twilio",
        providerMessageId: null,
        preview,
        error: `twilio_http_${res.status}: ${raw.slice(0, 400)}`,
      };
    }
    return {
      mode: "SEND",
      success: true,
      sent: true,
      provider: "twilio",
      providerMessageId: sidMsg,
      preview,
      error: null,
    };
  } catch (e) {
    return {
      mode: "SEND",
      success: false,
      sent: false,
      provider: "twilio",
      providerMessageId: null,
      preview,
      error: e && e.message ? e.message : "twilio_fetch_failed",
    };
  }
}

module.exports = { sendSMSCommunication };
