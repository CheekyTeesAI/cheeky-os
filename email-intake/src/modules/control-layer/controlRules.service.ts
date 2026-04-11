import type { ControlAction } from "./approval.service";
import { requiresApproval } from "./approval.service";

export function evaluateControlRules(action: ControlAction): {
  allowed: boolean;
  reason: string;
} {
  if (action.intent === "UNKNOWN") {
    return { allowed: false, reason: "Unknown intent is blocked" };
  }

  const approval = requiresApproval(action);
  if (approval.requiresApproval) {
    return { allowed: false, reason: approval.reason };
  }

  return { allowed: true, reason: "Safe operation allowed" };
}
