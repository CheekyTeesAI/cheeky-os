/**
 * Operator console — role definitions (sections + allowed action keys).
 * Additive only; used by operatorViewService + uiActionService.
 */

const OWNER = "OWNER";
const PRINTER = "PRINTER";
const ADMIN = "ADMIN";
const DESIGN = "DESIGN";

const ROLE_DEFINITIONS = {
  [OWNER]: {
    label: "Owner",
    sections: ["EXCEPTIONS", "APPROVALS", "OVERRIDES"],
    allowedActions: [
      "APPROVE_SEND",
      "REJECT_APPROVAL",
      "FORCE_ROUTE",
      "REASSIGN_SERVICE",
      "OVERRIDE_STATUS",
      "VENDOR_SEND",
    ],
  },
  [PRINTER]: {
    label: "Printer",
    sections: ["PRINT_NEXT", "IN_PRODUCTION", "BLOCKED", "DONE_TODAY"],
    allowedActions: [
      "TASK_START",
      "TASK_COMPLETE",
      "TASK_FLAG",
      "JOB_STATUS",
      "SEND_QC",
    ],
  },
  [ADMIN]: {
    label: "Admin",
    sections: ["CUSTOMER_SERVICE", "MISSING_INFO", "PAYMENTS", "PICKUP_READY"],
    allowedActions: [
      "COMM_PREVIEW",
      "COMM_SEND",
      "SERVICE_DESK_ASSIGN",
      "SERVICE_DESK_CLOSE",
      "SERVICE_DESK_SEND",
      "INTAKE_NOTE",
    ],
  },
  [DESIGN]: {
    label: "Design",
    sections: ["ART_NEEDED", "ART_REVIEW"],
    allowedActions: ["TASK_START", "TASK_COMPLETE", "JOB_PATCH", "COMM_PREVIEW"],
  },
};

function normalizeRole(role) {
  const r = String(role || "").toUpperCase().trim();
  if (r === "PRINT" || r === "JEREMY") return PRINTER;
  if (ROLE_DEFINITIONS[r]) return r;
  return ADMIN;
}

function getRoleDefinition(role) {
  const r = normalizeRole(role);
  return ROLE_DEFINITIONS[r] ? { role: r, ...ROLE_DEFINITIONS[r] } : { role: ADMIN, ...ROLE_DEFINITIONS[ADMIN] };
}

module.exports = {
  OWNER,
  PRINTER,
  ADMIN,
  DESIGN,
  ROLE_DEFINITIONS,
  normalizeRole,
  getRoleDefinition,
};
