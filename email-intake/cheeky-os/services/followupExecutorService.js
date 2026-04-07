/**
 * Bundle 25 — controlled auto follow-up SMS (rules + messagePrep + Twilio).
 */

const fs = require("fs");
const path = require("path");
const { getRevenueFollowups } = require("./revenueFollowups");
const { scoreFollowupOpportunities } = require("./followupScoringService");
const { evaluateFollowupAutomation } = require("./followupAutomationService");
const { prepareMessage } = require("./messagePrepService");
const { canRun } = require("./autopilotGuardService");

const STATE_FILE = path.join(__dirname, "..", "data", "followup-auto-state.json");

const MAX_SENDS_PER_RUN = 3;
const SMS_MAX_LEN = 300;

/**
 * Twilio outbound to customer E.164 — same REST + env as smsService.sendSMSAlert (Bundle 23).
 * smsService has no customer-`To` API; this path stays here so smsService.js stays frozen.
 * @param {string} toE164
 * @param {string} body
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendFollowupSms(toE164, body) {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(
    process.env.TWILIO_FROM ||
      process.env.TWILIO_PHONE_NUMBER ||
      process.env.TWILIO_NUMBER ||
      ""
  ).trim();
  const to = String(toE164 || "").trim();

  if (!sid || !token) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set" };
  }
  if (!from) {
    return { ok: false, error: "TWILIO_FROM (or TWILIO_PHONE_NUMBER) not set" };
  }
  if (!to) {
    return { ok: false, error: "to (customer E.164) required" };
  }

  let text = String(body || "").trim();
  if (!text) {
    return { ok: false, error: "body required" };
  }
  if (text.length > SMS_MAX_LEN) {
    text = text.slice(0, SMS_MAX_LEN - 3).trim() + "...";
  }

  const params = new URLSearchParams({
    To: to,
    From: from,
    Body: text,
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

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeE164(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return s;
}

function loadState() {
  try {
    const txt = fs.readFileSync(STATE_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && typeof j === "object" && j.byKey && typeof j.byKey === "object") {
      return { version: 1, byKey: { ...j.byKey } };
    }
  } catch (_) {}
  return { version: 1, byKey: {} };
}

/**
 * @param {{ version?: number, byKey: Record<string, { sendCount?: number, lastSentAt?: string }> }} s
 */
function saveState(s) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), "utf8");
}

/**
 * @returns {Promise<{ sent: number, skipped: number, errors: string[] }>}
 */
async function runFollowupExecutor() {
  const out = { sent: 0, skipped: 0, errors: [] };
  const gate = canRun("followup_send");
  if (!gate.allowed) {
    out.errors.push(gate.reason);
    console.warn("[followupExecutor] blocked:", gate.reason);
    return out;
  }
  const state = loadState();

  try {
    const rev = await getRevenueFollowups();
    const scored = scoreFollowupOpportunities(
      rev.unpaidInvoices || [],
      rev.staleEstimates || []
    );

    const candidates = scored.filter((r) => {
      const p = String(r.priority || "").toLowerCase();
      return p === "high" || p === "critical";
    });

    for (const row of candidates) {
      if (out.sent >= MAX_SENDS_PER_RUN) break;

      const key = normalizeE164(row.phone);
      if (!key) {
        out.skipped++;
        continue;
      }

      const prev = state.byKey[key] || { sendCount: 0, lastSentAt: "" };
      const lastTouch = String(prev.lastSentAt || "").trim();
      const decision = evaluateFollowupAutomation(
        {
          customerName: row.customerName,
          phone: row.phone,
          daysOld: row.daysOld,
          amount: row.amount,
          lastContactedAt: lastTouch,
          status: row.type || "",
        },
        { sendCount: prev.sendCount, lastSentAt: lastTouch }
      );

      if (!decision.shouldSend) {
        out.skipped++;
        continue;
      }

      const msgType = row.type === "invoice" ? "invoice" : "followup";
      const { message } = prepareMessage({
        type: msgType,
        customerName: row.customerName,
        amount: row.amount,
        daysOld: row.daysOld,
      });

      const sendResult = await sendFollowupSms(key, message);
      if (!sendResult.ok) {
        out.errors.push(String(sendResult.error || "send_failed"));
        break;
      }

      state.byKey[key] = {
        sendCount: Math.floor(Number(prev.sendCount) || 0) + 1,
        lastSentAt: new Date().toISOString(),
      };
      saveState(state);
      out.sent++;
      console.log("[followupExecutor] sent sms", {
        to: key,
        runTotal: out.sent,
        msgType,
      });
    }
  } catch (err) {
    out.errors.push(String(err && err.message ? err.message : err));
  }

  return out;
}

module.exports = { runFollowupExecutor, MAX_SENDS_PER_RUN, normalizeE164 };
