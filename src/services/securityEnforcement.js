/**
 * Central enforcement for critical HTTP actions — pause/safe mode, permissions, approval, audit.
 */
const { getUserFromRequest } = require("./authService");
const { checkPermission, ACTIONS } = require("./permissionService");
const { requiresOwnerApproval, validateApprovalUnlock } = require("./approvalLockService");
const { appendAudit } = require("./auditLogService");
const ctrl = require("./systemControlService");

const SEC = () => String(process.env.CHEEKY_SECURITY_ENABLED || "").toLowerCase() === "true";

/**
 * @returns {boolean} false if response already sent
 */
function enforceAction(req, res, actionKey, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const action = String(actionKey || "").toUpperCase();
  const endpoint = o.endpoint || req.originalUrl || req.url || "";

  const blockOutbound = ["COMM_SEND", "VENDOR_SEND"].includes(action);
  const blockFinancial = ["SQUARE_INVOICE_CREATE", "SQUARE_QUOTE_CREATE"].includes(action);

  if (blockOutbound && ctrl.shouldBlockOutbound()) {
    res.status(200).json({
      success: false,
      blocked: true,
      reason: "system_paused_or_safe_mode",
      requiresApproval: false,
      control: ctrl.getSystemState(),
    });
    appendAudit({
      userId: (getUserFromRequest(req) || {}).userId,
      action,
      endpoint,
      result: "blocked_control",
    });
    return false;
  }

  if (blockFinancial && ctrl.shouldBlockFinancialWrites()) {
    res.status(200).json({
      success: false,
      blocked: true,
      reason: "safe_mode_or_pause_blocks_financial_writes",
      control: ctrl.getSystemState(),
    });
    appendAudit({
      userId: (getUserFromRequest(req) || {}).userId,
      action,
      endpoint,
      result: "blocked_financial",
    });
    return false;
  }

  const user = getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ success: false, error: "unauthorized" });
    return false;
  }

  if (SEC()) {
    const perm = checkPermission(user, action);
    if (!perm.allowed) {
      res.status(403).json({ success: false, error: "forbidden", reason: perm.reason, role: user.role });
      appendAudit({ userId: user.userId, action, endpoint, result: "denied_permission" });
      return false;
    }

    const need = requiresOwnerApproval(action);
    if (need.required && String(user.role).toUpperCase() !== "OWNER") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const val = validateApprovalUnlock(user, action, body);
      if (!val.ok && String(process.env.CHEEKY_BYPASS_APPROVAL || "").toLowerCase() !== "true") {
        res.status(200).json({
          success: false,
          requiresApproval: true,
          actionPreview: {
            action,
            endpoint,
            hint: "Obtain owner approval id or call as OWNER",
          },
          reason: need.reason || "owner_approval",
        });
        appendAudit({ userId: user.userId, action, endpoint, result: "pending_approval" });
        return false;
      }
    }
  }

  return true;
}

function auditResult(req, actionKey, resultSummary, payloadHint) {
  const user = getUserFromRequest(req);
  appendAudit({
    userId: user && user.userId,
    action: String(actionKey || ""),
    endpoint: req.originalUrl || req.url,
    result: resultSummary,
    payload: payloadHint,
  });
}

/**
 * Non-HTTP callers (e.g. POST /command) — same policy as enforceAction without Express res.
 * @returns {{ ok: true } | { ok: false, code: string, reason?: string, requiresApproval?: boolean }}
 */
function enforceCommandAction(user, body, actionKey) {
  const action = String(actionKey || "").toUpperCase();
  const bypass = String(process.env.CHEEKY_BYPASS_APPROVAL || "").toLowerCase() === "true";
  if (!user) {
    return { ok: false, code: "unauthorized" };
  }
  if (!SEC()) {
    return { ok: true };
  }
  const perm = checkPermission(user, action);
  if (!perm.allowed) {
    return { ok: false, code: "forbidden", reason: perm.reason };
  }
  const need = requiresOwnerApproval(action);
  if (need.required && String(user.role).toUpperCase() !== "OWNER") {
    const b = body && typeof body === "object" ? body : {};
    const val = validateApprovalUnlock(user, action, b);
    if (!val.ok && !bypass) {
      return { ok: false, code: "approval", requiresApproval: true, reason: need.reason || "owner_approval" };
    }
  }
  return { ok: true };
}

module.exports = {
  enforceAction,
  auditResult,
  enforceCommandAction,
  ACTIONS,
};
