"use strict";

/**
 * Phase 7 — declarative cockpit view metadata (additive).
 * UI applies body classes client-side using these hints; no mutations.
 */

const MODES = /** @type {const} */ (["advisor", "jeremy", "patrick"]);

const GUARD =
  "You are Cheeky-AI dashboard co-pilot: blockers + cashflow first; read-only recommendations; never execute approvals or outbound sends automatically.";

/**
 * @param {string} [modeRaw]
 */
function normalizeMode(modeRaw) {
  const m = String(modeRaw || "advisor")
    .trim()
    .toLowerCase();
  if (m === "jeremy" || m === "operator") return "jeremy";
  if (m === "patrick" || m === "ceo" || m === "growth") return "patrick";
  if (m === "advisor" || m === "daily" || m === "cockpit") return "advisor";
  return "advisor";
}

function getDefaultMode() {
  return "advisor";
}

/**
 * @param {string} [modeRaw]
 */
function describeView(modeRaw) {
  const mode = normalizeMode(modeRaw);
  /** @type {Record<string,{label:string,hint:string}>} */
  const meta = {
    advisor: {
      label: "Cheeky Advisor cockpit",
      hint: "Default command center: blockers, approvals, changes, risks, and AI-guided next actions.",
    },
    jeremy: {
      label: "Jeremy · daily operator",
      hint: "Execution-only: clear READY lanes, drafts, approvals, intake — hide growth clutter.",
    },
    patrick: {
      label: "Patrick · sales / growth / CEO",
      hint: "Cash, KPIs, ads, approvals, pipelines — ops blockers remain visible upstream.",
    },
  };

  return {
    mode,
    defaultMode: getDefaultMode(),
    label: meta[mode].label,
    cockpitHint: meta[mode].hint,
    modesAvailable: [...MODES],
    bodyClass: `dashboard-view-${mode}`,
    /** Section ids used by dashboard HTML + helpbot anchors */
    sectionAnchors: {
      blockers: "sections-root",
      whatNow: "what-now-panel",
      approvals: "phase2-approvals-section",
      drafts: "phase2-drafts-section",
      intakeLookup: "phase5-jeremy-intake-panel",
      patrickExecutive: "phase7-patrick-wrap",
      friction: "friction-anchor",
      helpbot: "phase7-cheeky-ai-helpbot",
      teamActivity: "phase7-team-activity",
    },
    visibility: {
      advisor: {
        cheekyAdvisorSummary: true,
        patrickExecutiveDefaultClosed: true,
      },
      jeremy: {
        hidePatrickExecutive: true,
        hideDailyAdvisorStrip: true,
      },
      patrick: {
        hideDailyAdvisorStrip: true,
        patrickExecutiveDefaultOpen: true,
      },
    }[mode],
    guardrailEcho: GUARD,
  };
}

module.exports = {
  MODES,
  normalizeMode,
  getDefaultMode,
  describeView,
  PHASE7_VIEW_GUARDRAIL: GUARD,
};
