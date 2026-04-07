/**
 * Bundle 35 — central in-memory automation guardrails + kill switch.
 */

const DEFAULT_LIMITS = {
  maxFollowupsPerRun: 3,
  maxInvoicesPerRun: 2,
  maxProductionMovesPerRun: 5,
};

const state = {
  autopilotEnabled: false,
  killSwitchActive: false,
  safeMode: true,
  limits: { ...DEFAULT_LIMITS },
  lastChangedAt: "",
  lastChangedBy: "system",
};

/**
 * @param {string} changedBy
 */
function touch(changedBy) {
  state.lastChangedAt = new Date().toISOString();
  state.lastChangedBy = String(changedBy || "system").trim() || "system";
}

function getState() {
  return {
    autopilotEnabled: state.autopilotEnabled,
    killSwitchActive: state.killSwitchActive,
    safeMode: state.safeMode,
    limits: { ...state.limits },
    lastChangedAt: state.lastChangedAt,
    lastChangedBy: state.lastChangedBy,
  };
}

/**
 * @param {string} changedBy
 */
function enableAutopilot(changedBy) {
  state.autopilotEnabled = true;
  touch(changedBy);
  return getState();
}

/**
 * @param {string} changedBy
 */
function disableAutopilot(changedBy) {
  state.autopilotEnabled = false;
  touch(changedBy);
  return getState();
}

/**
 * @param {string} changedBy
 */
function activateKillSwitch(changedBy) {
  state.killSwitchActive = true;
  touch(changedBy);
  return getState();
}

/**
 * @param {string} changedBy
 */
function deactivateKillSwitch(changedBy) {
  state.killSwitchActive = false;
  touch(changedBy);
  return getState();
}

/**
 * @param {string} actionType
 * @returns {{ allowed: boolean, reason: string, state: ReturnType<typeof getState> }}
 */
function canRun(actionType) {
  const action = String(actionType || "").trim().toLowerCase();

  if (state.killSwitchActive) {
    return {
      allowed: false,
      reason: "Kill switch active",
      state: getState(),
    };
  }

  if (!state.autopilotEnabled) {
    return {
      allowed: false,
      reason: "Autopilot disabled",
      state: getState(),
    };
  }

  if (state.safeMode) {
    const safeAllowed = new Set(["system_check", "summary", "alerts"]);
    if (!safeAllowed.has(action)) {
      return {
        allowed: false,
        reason: "Safe mode blocks mutating automation",
        state: getState(),
      };
    }
  }

  return {
    allowed: true,
    reason: "Allowed",
    state: getState(),
  };
}

module.exports = {
  getState,
  enableAutopilot,
  disableAutopilot,
  activateKillSwitch,
  deactivateKillSwitch,
  canRun,
};
