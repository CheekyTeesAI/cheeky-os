/**
 * Owner approval requirement for high-risk operations (non-OWNER must present approvalId when security on).
 */
const { requireApproval } = require("./approvalEngine");

const NEEDS_APPROVAL = new Set([
  "VENDOR_SEND",
  "COMM_SEND",
  "SQUARE_INVOICE_CREATE",
  "SQUARE_QUOTE_CREATE",
  "JOB_STATUS_ESCALATED",
  "AUTOMATION_TOGGLE",
  "SYSTEM_PAUSE",
  "SYSTEM_RESUME",
  "SYSTEM_LOCK",
  "SYSTEM_UNLOCK",
  "SYSTEM_INTERVAL_START",
  "SYSTEM_INTERVAL_STOP",
]);

/**
 * @param {string} action
 * @returns {{ required: boolean, reason?: string }}
 */
function requiresOwnerApproval(action) {
  const a = String(action || "").toUpperCase();
  if (NEEDS_APPROVAL.has(a)) {
    return { required: true, reason: "owner_approval_or_explicit_approval_id" };
  }
  return { required: false };
}

/**
 * If approval required and caller is not OWNER, ensure body has approvalId that exists and is APPROVED.
 * @param {{ role: string }} user
 * @param {string} action
 * @param {object} body
 * @returns {{ ok: boolean, error?: string, approvalEntry?: object }}
 */
function validateApprovalUnlock(user, action, body) {
  const req = requiresOwnerApproval(action);
  if (!req.required) return { ok: true };
  if (user && String(user.role).toUpperCase() === "OWNER") return { ok: true };
  const b = body && typeof body === "object" ? body : {};
  const aid = String(b.approvalId || b.ownerApprovalId || "").trim();
  if (!aid) return { ok: false, error: "approval_required" };
  const { getApproval } = require("./approvalEngine");
  const row = getApproval(aid);
  if (!row || row.status !== "APPROVED") {
    return { ok: false, error: "invalid_or_pending_approval" };
  }
  return { ok: true, approvalEntry: row };
}

/**
 * Create a pending approval for an action (caller uses returned id after owner approves in dashboard).
 */
function lockAction(actionType, payload) {
  return requireApproval(String(actionType || "LOCKED_ACTION").toUpperCase(), payload || {});
}

module.exports = {
  requiresOwnerApproval,
  validateApprovalUnlock,
  lockAction,
  NEEDS_APPROVAL,
};
