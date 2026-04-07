/**
 * Bundle 24 — time-based escalation for unresolved alerts (no auto-notify).
 */

const TEN_MIN_MS = 10 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

/**
 * @param {{ createdAt?: string } | null | undefined} alert
 * @returns {{ escalationLevel: 0 | 1 | 2, shouldEscalate: boolean }}
 */
function evaluateEscalation(alert) {
  const raw = alert && alert.createdAt;
  const t = raw ? new Date(raw).getTime() : NaN;
  const ageMs = Number.isFinite(t) ? Date.now() - t : 0;

  /** @type {0 | 1 | 2} */
  let escalationLevel = 0;
  if (ageMs >= THIRTY_MIN_MS) escalationLevel = 2;
  else if (ageMs >= TEN_MIN_MS) escalationLevel = 1;

  return {
    escalationLevel,
    shouldEscalate: escalationLevel > 0,
  };
}

/**
 * @param {string} msg
 */
function stripEscalationPrefixes(msg) {
  let m = String(msg || "").trim();
  let prev = "";
  while (m !== prev) {
    prev = m;
    m = m
      .replace(
        /^\[(ESCALATED|URGENT ESCALATION|NEEDS ATTENTION)\]\s*/i,
        ""
      )
      .trim();
  }
  return m;
}

/**
 * Level 1 → needs attention → [ESCALATED]
 * Level 2 → urgent escalation → [URGENT ESCALATION]
 * @param {string} currentMessage
 * @param {number} newLevel
 */
function buildEscalatedMessage(currentMessage, newLevel) {
  const base = stripEscalationPrefixes(currentMessage);
  if (newLevel >= 2) return `[URGENT ESCALATION] ${base}`;
  if (newLevel >= 1) return `[ESCALATED] ${base}`;
  return base;
}

module.exports = {
  evaluateEscalation,
  buildEscalatedMessage,
  stripEscalationPrefixes,
};
