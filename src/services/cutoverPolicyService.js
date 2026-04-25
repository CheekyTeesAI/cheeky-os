/**
 * LIVE mode gate — critical vs non-critical blockers.
 */

const CRITICAL_SUBSYSTEMS = new Set(["storage", "database", "square_read"]);

function evaluateCutoverPolicy(validationPayload) {
  const subsystems = validationPayload && Array.isArray(validationPayload.subsystems) ? validationPayload.subsystems : [];
  const criticalBlockers = [];
  const nonCriticalWarnings = [];

  for (const s of subsystems) {
    if (!s) continue;
    const name = String(s.subsystem || "");
    if (s.blocking && CRITICAL_SUBSYSTEMS.has(name)) {
      criticalBlockers.push(`${name}: ${(s.warnings && s.warnings[0]) || s.mode || "blocked"}`);
    } else if (Array.isArray(s.warnings)) {
      for (const w of s.warnings) nonCriticalWarnings.push(`${name}: ${w}`);
    }
  }

  const canEnterLiveMode = criticalBlockers.length === 0;

  return { canEnterLiveMode, criticalBlockers, nonCriticalWarnings };
}

module.exports = { evaluateCutoverPolicy, CRITICAL_SUBSYSTEMS };
