import { getNextBestActions } from "../decision-engine/decisionEngine.service";
import { type DecisionAction } from "../decision-engine/actionGenerator.service";
import { getSystemState } from "../core/services/systemState.service";
import { executeAction, type ExecutionInput } from "./actionExecutor.service";
import { canAutoExecute, classifyActionType } from "./safetyGuard.service";

export type AutoOperatorResult = {
  executed: Array<Record<string, unknown>>;
  skipped: Array<Record<string, unknown>>;
  warnings: string[];
};

function extractTarget(action: string): string | null {
  if (action.startsWith("Follow up ")) return action.replace("Follow up ", "").trim();
  if (action.startsWith("Print ")) return action.replace("Print ", "").replace(" job", "").trim();
  if (action.startsWith("Order blanks for ")) return action.replace("Order blanks for ", "").trim();
  if (action.startsWith("Move ")) return action.replace("Move ", "").replace(" to production", "").trim();
  if (action.startsWith("Complete ")) return action.replace("Complete ", "").trim();
  return null;
}

function toExecutionInput(action: DecisionAction, state: Awaited<ReturnType<typeof getSystemState>>): ExecutionInput {
  const type = classifyActionType(action.action);
  const target = extractTarget(action.action);
  const order =
    target
      ? state.orders.find(
          (o) =>
            o.name.toLowerCase().includes(target.toLowerCase()) ||
            String(o.customerName || "").toLowerCase().includes(target.toLowerCase())
        )
      : undefined;

  if (type === "FOLLOW_UP") {
    return { type, action: action.action, target };
  }
  if (type === "MOVE_TO_PRODUCTION") {
    return { type, action: action.action, target, orderId: order?.id || null };
  }
  if (type === "CREATE_TASK") {
    return { type, action: action.action, target };
  }
  if (type === "FLAG_ISSUE") {
    return {
      type,
      action: action.action,
      target,
      orderId: order?.id || null,
      note: `Auto issue flag: ${action.reason}`
    };
  }
  return { type: "FLAG_ISSUE", action: action.action, target, note: "Unknown action mapped as issue" };
}

export async function runAutoOperator(mode: "execute" | "dry-run" = "execute"): Promise<AutoOperatorResult> {
  const [actions, state] = await Promise.all([getNextBestActions(), getSystemState()]);

  const executed: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];

  for (const action of actions.slice(0, 3)) {
    const safety = canAutoExecute(action, state);
    if (!safety.allowed) {
      skipped.push({ action: action.action, reason: safety.reason || "Blocked by safety guard" });
      continue;
    }

    if (mode === "dry-run") {
      executed.push({
        action: action.action,
        result: "would_execute",
        reason: action.reason,
        impact: action.impact
      });
      continue;
    }

    const execInput = toExecutionInput(action, state);
    const result = await executeAction(execInput);
    if (!result.success) {
      warnings.push(`Execution failed: ${action.action}`);
    }
    executed.push({
      action: action.action,
      result: result.result,
      details: result.details || null
    });
  }

  if (actions.length === 0) {
    warnings.push("No actions available from decision engine");
  }

  return { executed, skipped, warnings };
}
