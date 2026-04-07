/**
 * Bundle 25 — rules for controlled auto follow-up SMS (no sends here).
 */

const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MIN_DAYS = 3;
const MIN_AMOUNT = 200;
const MAX_AUTO_SENDS_PER_CUSTOMER = 2;

/**
 * @param {unknown} iso
 * @returns {number}
 */
function parseTime(iso) {
  const t = new Date(iso || "").getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {unknown} v
 * @returns {string}
 */
function normPhone(v) {
  return String(v == null ? "" : v).trim();
}

/**
 * @param {{
 *   customerName?: string,
 *   phone?: string,
 *   daysOld?: unknown,
 *   amount?: unknown,
 *   lastContactedAt?: string,
 *   status?: string
 * }} input
 * @param {{ sendCount?: unknown, lastSentAt?: string }} [runtime]
 * @returns {{
 *   shouldSend: boolean,
 *   reason: string,
 *   cooldownPassed: boolean
 * }}
 */
function evaluateFollowupAutomation(input, runtime) {
  const rt = runtime && typeof runtime === "object" ? runtime : {};
  const phone = normPhone(input && input.phone);
  const daysOld = Math.max(0, Math.floor(Number(input && input.daysOld) || 0));
  const amount = Number(input && input.amount);
  const amountOk = Number.isFinite(amount) && amount >= MIN_AMOUNT;

  const inputContact = parseTime(input && input.lastContactedAt);
  const lastAuto = parseTime(rt.lastSentAt);
  const lastContactMs = Math.max(inputContact, lastAuto);
  const now = Date.now();
  const cooldownPassed =
    lastContactMs <= 0 || now - lastContactMs >= COOLDOWN_MS;

  const sendCount = Math.max(0, Math.floor(Number(rt.sendCount) || 0));

  if (!phone) {
    return {
      shouldSend: false,
      reason: "no_phone",
      cooldownPassed,
    };
  }
  if (daysOld < MIN_DAYS) {
    return {
      shouldSend: false,
      reason: "days_old_below_minimum",
      cooldownPassed,
    };
  }
  if (!amountOk) {
    return {
      shouldSend: false,
      reason: "amount_below_minimum",
      cooldownPassed,
    };
  }
  if (sendCount >= MAX_AUTO_SENDS_PER_CUSTOMER) {
    return {
      shouldSend: false,
      reason: "auto_followup_cap_reached",
      cooldownPassed,
    };
  }
  if (!cooldownPassed) {
    return {
      shouldSend: false,
      reason: "cooldown_active",
      cooldownPassed: false,
    };
  }

  return {
    shouldSend: true,
    reason: "eligible",
    cooldownPassed: true,
  };
}

module.exports = {
  evaluateFollowupAutomation,
  COOLDOWN_MS,
  MIN_DAYS,
  MIN_AMOUNT,
  MAX_AUTO_SENDS_PER_CUSTOMER,
};
