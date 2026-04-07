/**
 * Bundle 25 — controlled auto follow-up SMS (rules + messagePrep + Twilio).
 */

const fs = require("fs");
const path = require("path");
const { getRevenueFollowups } = require("./revenueFollowups");
const { scoreFollowupOpportunities } = require("./followupScoringService");
const { evaluateFollowupAutomation } = require("./followupAutomationService");
const { prepareMessage } = require("./messagePrepService");
const { sendOutboundSms } = require("./smsService");

const STATE_FILE = path.join(__dirname, "..", "data", "followup-auto-state.json");

const MAX_SENDS_PER_RUN = 3;

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

      const sendResult = await sendOutboundSms({ to: key, body: message });
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
