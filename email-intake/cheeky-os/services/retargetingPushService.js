/**
 * Bundle 51 — capped retargeting SMS (Twilio). followupExecutor only handles revenue-queue rows;
 * this path sends the bundle template to ranked targets with the same guardrails + cooldowns.
 */

const fs = require("fs");
const path = require("path");
const { canRun } = require("./autopilotGuardService");
const { recordLedgerEventSafe } = require("./actionLedgerService");
const { normalizeE164 } = require("./followupExecutorService");
const { getRetargetingTargets } = require("./retargetingTargetsService");

const STATE_FILE = path.join(__dirname, "..", "data", "retargeting-push-state.json");
const FOLLOWUP_STATE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "followup-auto-state.json"
);
const REACTIVATION_STATE_FILE = path.join(
  __dirname,
  "..",
  "data",
  "reactivation-push-state.json"
);
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MAX_SENDS_PER_RUN = 3;
const SMS_MAX_LEN = 300;

/**
 * @param {string} full
 * @returns {string}
 */
function firstName(full) {
  const s = String(full || "").trim();
  if (!s) return "there";
  const part = s.split(/\s+/)[0];
  return part || "there";
}

/**
 * @param {string} toE164
 * @param {string} body
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function sendSms(toE164, body) {
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
 * @param {{ version?: number, byKey: Record<string, { lastSentAt?: string }> }} s
 */
function saveState(s) {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), "utf8");
}

/**
 * @param {string} filePath
 * @param {string} key
 * @returns {number}
 */
function lastSentInStore(filePath, key) {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    const j = JSON.parse(txt);
    const row = j && j.byKey && j.byKey[key];
    const t = row && row.lastSentAt ? new Date(String(row.lastSentAt)).getTime() : 0;
    return Number.isFinite(t) ? t : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * @param {string} key
 * @returns {number}
 */
function lastFollowupSentMs(key) {
  return lastSentInStore(FOLLOWUP_STATE_FILE, key);
}

/**
 * @param {string} key
 * @returns {number}
 */
function lastReactivationSentMs(key) {
  return lastSentInStore(REACTIVATION_STATE_FILE, key);
}

/**
 * @returns {Promise<{ success: boolean, contacted: number, error?: string }>}
 */
async function runRetargetingPush() {
  const gate = canRun("followup_send");
  if (!gate.allowed) {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "retargeting_push_blocked",
      status: "blocked",
      reason: String(gate.reason || ""),
    });
    return { success: false, contacted: 0, error: String(gate.reason || "blocked") };
  }

  let targets = [];
  try {
    const payload = await getRetargetingTargets();
    targets = Array.isArray(payload.targets) ? payload.targets : [];
  } catch (err) {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "retargeting_push_error",
      status: "blocked",
      reason: String(err && err.message ? err.message : err),
    });
    return { success: false, contacted: 0, error: "targets_load_failed" };
  }

  const tier = targets.filter((t) => {
    const p = String(t.retargetPriority || "").toLowerCase();
    return p === "critical" || p === "high";
  });
  const candidates = tier.slice(0, 5);

  if (!candidates.length) {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "retargeting_push_skipped",
      status: "skipped",
      reason: "No critical/high retargeting targets",
    });
    return { success: true, contacted: 0 };
  }

  const state = loadState();
  let contacted = 0;
  /** @type {Set<string>} */
  const runKeys = new Set();
  const now = Date.now();

  try {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "retargeting_push_start",
      status: "info",
      reason: `${candidates.length} candidates (max ${MAX_SENDS_PER_RUN} sends)`,
    });
  } catch (_) {}

  for (const c of candidates) {
    if (contacted >= MAX_SENDS_PER_RUN) break;

    const key = normalizeE164(c.phone);
    if (!key) {
      recordLedgerEventSafe({
        type: "followup",
        action: "retargeting_skipped_no_phone",
        status: "skipped",
        customerName: String(c.customerName || ""),
        reason: "No phone",
      });
      continue;
    }
    if (runKeys.has(key)) continue;
    runKeys.add(key);

    const prev = state.byKey[key] || {};
    const lastRetMs = new Date(String(prev.lastSentAt || "")).getTime();
    const effectiveLast = Math.max(
      Number.isFinite(lastRetMs) ? lastRetMs : 0,
      lastFollowupSentMs(key),
      lastReactivationSentMs(key)
    );
    if (effectiveLast > 0 && now - effectiveLast < COOLDOWN_MS) {
      recordLedgerEventSafe({
        type: "followup",
        action: "retargeting_skipped_cooldown",
        status: "skipped",
        customerName: String(c.customerName || ""),
        reason: "Contacted within 24h",
      });
      continue;
    }

    const name = firstName(c.customerName);
    const message =
      `Hey ${name} — just wanted to circle back on this. I can get this moving for you quickly if you're still interested.`;

    const sendResult = await sendSms(key, message);
    if (!sendResult.ok) {
      recordLedgerEventSafe({
        type: "followup",
        action: "retargeting_send_failed",
        status: "blocked",
        customerName: String(c.customerName || ""),
        reason: String(sendResult.error || "send_failed"),
      });
      break;
    }

    state.byKey[key] = { lastSentAt: new Date().toISOString() };
    saveState(state);
    contacted++;
    recordLedgerEventSafe({
      type: "followup",
      action: "retargeting_sent",
      status: "success",
      customerName: String(c.customerName || ""),
      reason: "Retargeting SMS",
    });
  }

  try {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "retargeting_push_complete",
      status: "success",
      reason: `contacted:${contacted}`,
    });
  } catch (_) {}

  return { success: true, contacted };
}

module.exports = {
  runRetargetingPush,
  MAX_SENDS_PER_RUN,
};
