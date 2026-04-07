/**
 * Bundle 23 — single SMS batch via Twilio REST (fetch only, no SDK).
 */

const SMS_MAX_LEN = 300;

function smsRank(sev) {
  const x = String(sev || "").toLowerCase();
  if (x === "critical") return 0;
  if (x === "high") return 1;
  return 9;
}

/**
 * @returns {string}
 */
function getSmsTo() {
  return String(
    process.env.CHEEKY_SMS_TO ||
      process.env.TWILIO_TO ||
      process.env.NOTIFY_SMS_TO ||
      ""
  ).trim();
}

/**
 * @param {{ message?: string, severity?: string }[]} alerts
 * @returns {Promise<{ ok: boolean, error?: string, count?: number }>}
 */
async function sendSMSAlert(alerts) {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(
    process.env.TWILIO_FROM ||
      process.env.TWILIO_PHONE_NUMBER ||
      process.env.TWILIO_NUMBER ||
      ""
  ).trim();
  const to = getSmsTo();

  if (!sid || !token) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set" };
  }
  if (!from) {
    return { ok: false, error: "TWILIO_FROM (or TWILIO_PHONE_NUMBER) not set" };
  }
  if (!to) {
    return {
      ok: false,
      error:
        "Set CHEEKY_SMS_TO (or TWILIO_TO / NOTIFY_SMS_TO) to recipient E.164",
    };
  }

  const list = Array.isArray(alerts) ? alerts : [];
  const filtered = list.filter((a) => {
    if (!a || typeof a !== "object") return false;
    const s = String(a.severity || "")
      .trim()
      .toLowerCase();
    return s === "high" || s === "critical";
  });
  const sorted = filtered.slice().sort((a, b) => smsRank(a.severity) - smsRank(b.severity));
  const top = sorted.slice(0, 5);

  if (!top.length) {
    return { ok: false, error: "no high/critical alerts to send" };
  }

  const lines = top
    .map((a) => {
      const m = String((a && a.message) || "").trim();
      return m ? `- ${m}` : "";
    })
    .filter(Boolean);

  let body = "Cheeky OS:\n" + lines.join("\n") + "\n\nCheck dashboard now.";
  if (body.length > SMS_MAX_LEN) {
    body = body.slice(0, SMS_MAX_LEN - 3).trim() + "...";
  }

  const params = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: txt.slice(0, 400) };
  }
  return { ok: true, count: lines.length };
}

/**
 * Bundle 25 — outbound SMS to a specific E.164 (customer follow-ups). Same Twilio env as above.
 * @param {{ to?: string, body?: string }} opts
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendOutboundSms(opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(
    process.env.TWILIO_FROM ||
      process.env.TWILIO_PHONE_NUMBER ||
      process.env.TWILIO_NUMBER ||
      ""
  ).trim();
  const to = String(o.to || "").trim();

  if (!sid || !token) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set" };
  }
  if (!from) {
    return { ok: false, error: "TWILIO_FROM (or TWILIO_PHONE_NUMBER) not set" };
  }
  if (!to) {
    return { ok: false, error: "to (customer E.164) required" };
  }

  let body = String(o.body || "").trim();
  if (!body) {
    return { ok: false, error: "body required" };
  }
  if (body.length > SMS_MAX_LEN) {
    body = body.slice(0, SMS_MAX_LEN - 3).trim() + "...";
  }

  const params = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, error: txt.slice(0, 400) };
  }
  return { ok: true };
}

module.exports = { sendSMSAlert, getSmsTo, sendOutboundSms };
