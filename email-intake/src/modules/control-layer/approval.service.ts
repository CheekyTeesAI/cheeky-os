import { routeIntent } from "../jarvis/services/commandRouter.service";
import type { ParsedIntent } from "../jarvis/services/intentParser.service";

export type ControlAction = {
  intent: ParsedIntent["intent"];
  message: string;
  parsedIntent: ParsedIntent;
  amount?: number;
  orderValue?: number;
  changesProductionStatus?: boolean;
  externalCommunication?: boolean;
};

type ApprovalRequest = {
  approvalId: string;
  action: ControlAction;
  message: string;
  createdAt: string;
};

const approvalQueue: ApprovalRequest[] = [];

function makeId(): string {
  return `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function requiresApproval(action: ControlAction): {
  requiresApproval: boolean;
  reason: string;
} {
  if ((action.amount ?? 0) > 500) {
    return { requiresApproval: true, reason: "Action involves money > $500" };
  }
  if ((action.orderValue ?? 0) > 2000) {
    return { requiresApproval: true, reason: "Order value > $2000" };
  }
  if (action.changesProductionStatus) {
    return { requiresApproval: true, reason: "Changing production status requires approval" };
  }
  if (action.externalCommunication) {
    return { requiresApproval: true, reason: "External communication requires approval" };
  }
  return { requiresApproval: false, reason: "Safe action" };
}

export function createApprovalRequest(action: ControlAction): {
  approvalId: string;
  action: ControlAction;
  message: string;
} {
  const approvalId = makeId();
  const request: ApprovalRequest = {
    approvalId,
    action,
    message: "Approve this action?",
    createdAt: new Date().toISOString()
  };
  approvalQueue.push(request);
  return {
    approvalId: request.approvalId,
    action: request.action,
    message: request.message
  };
}

export async function approveAction(approvalId: string): Promise<{
  success: boolean;
  approvalId: string;
  result?: unknown;
  message: string;
}> {
  const idx = approvalQueue.findIndex((r) => r.approvalId === approvalId);
  if (idx < 0) {
    return {
      success: false,
      approvalId,
      message: "Approval request not found"
    };
  }

  const req = approvalQueue[idx];
  approvalQueue.splice(idx, 1);

  const routed = await routeIntent(req.action.parsedIntent);
  return {
    success: true,
    approvalId,
    result: routed.result,
    message: "Approved action executed"
  };
}
