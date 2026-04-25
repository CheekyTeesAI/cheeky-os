/**
 * Action permissions by role — additive policy.
 */

const ACTIONS = {
  VENDOR_SEND: "VENDOR_SEND",
  VENDOR_PREVIEW: "VENDOR_PREVIEW",
  COMM_SEND: "COMM_SEND",
  COMM_PREVIEW: "COMM_PREVIEW",
  SQUARE_INVOICE_CREATE: "SQUARE_INVOICE_CREATE",
  SQUARE_QUOTE_CREATE: "SQUARE_QUOTE_CREATE",
  SQUARE_INVOICE_PREVIEW: "SQUARE_INVOICE_PREVIEW",
  JOB_STATUS: "JOB_STATUS",
  JOB_STATUS_ESCALATED: "JOB_STATUS_ESCALATED",
  AUTOMATION_TOGGLE: "AUTOMATION_TOGGLE",
  AUTOMATION_RUN: "AUTOMATION_RUN",
  SYSTEM_PAUSE: "SYSTEM_PAUSE",
  SYSTEM_RESUME: "SYSTEM_RESUME",
  SYSTEM_LOCK: "SYSTEM_LOCK",
  SYSTEM_UNLOCK: "SYSTEM_UNLOCK",
  SYSTEM_INTERVAL_START: "SYSTEM_INTERVAL_START",
  SYSTEM_INTERVAL_STOP: "SYSTEM_INTERVAL_STOP",
  AUDIT_READ: "AUDIT_READ",
  PRODUCTION_TASK: "PRODUCTION_TASK",
  SERVICE_DESK_WRITE: "SERVICE_DESK_WRITE",
};

function ownerAllowed() {
  return { allowed: true, reason: "owner" };
}

/**
 * @param {{ role: string } | null} user
 * @param {string} action
 * @returns {{ allowed: boolean, reason: string }}
 */
function checkPermission(user, action) {
  const a = String(action || "").toUpperCase();
  const role = user && user.role ? String(user.role).toUpperCase() : "OWNER";

  if (role === "OWNER") return ownerAllowed();

  if (a === "AUDIT_READ") {
    if (role === "ADMIN") return { allowed: true, reason: "admin_audit" };
    return { allowed: false, reason: "audit_restricted" };
  }

  const blocked = [
    "SQUARE_INVOICE_CREATE",
    "SQUARE_QUOTE_CREATE",
    "VENDOR_SEND",
    "AUTOMATION_TOGGLE",
    "SYSTEM_PAUSE",
    "SYSTEM_RESUME",
    "JOB_STATUS_ESCALATED",
    "SYSTEM_LOCK",
    "SYSTEM_UNLOCK",
    "SYSTEM_INTERVAL_START",
    "SYSTEM_INTERVAL_STOP",
  ];
  if (blocked.includes(a)) {
    return { allowed: false, reason: "blocked_for_non_owner" };
  }

  if (role === "PRINTER") {
    if (["PRODUCTION_TASK", "COMM_PREVIEW", "VENDOR_PREVIEW"].includes(a)) return { allowed: true, reason: "printer" };
    if (a === "JOB_STATUS") return { allowed: true, reason: "printer_limited" };
    return { allowed: false, reason: "printer_restricted" };
  }

  if (role === "ADMIN") {
    if (
      ["SERVICE_DESK_WRITE", "COMM_PREVIEW", "COMM_SEND", "JOB_STATUS", "AUTOMATION_RUN"].includes(a)
    ) {
      return { allowed: true, reason: "admin" };
    }
    return { allowed: false, reason: "admin_restricted" };
  }

  if (role === "DESIGN") {
    if (["PRODUCTION_TASK", "COMM_PREVIEW", "VENDOR_PREVIEW"].includes(a)) return { allowed: true, reason: "design" };
    return { allowed: false, reason: "design_restricted" };
  }

  return { allowed: false, reason: "unknown_role" };
}

module.exports = {
  ACTIONS,
  checkPermission,
};
