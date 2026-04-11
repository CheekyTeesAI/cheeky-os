import { getDataverseAccessToken } from "../production/dataverseRead";

export type ExecutionInput = {
  type: "FOLLOW_UP" | "MOVE_TO_PRODUCTION" | "CREATE_TASK" | "FLAG_ISSUE";
  action: string;
  target?: string | null;
  orderId?: string | null;
  note?: string | null;
};

export type ExecutionResult = {
  success: boolean;
  action: string;
  result: "executed" | "skipped" | "failed";
  details?: Record<string, unknown>;
};

function timestamp(): string {
  return new Date().toISOString();
}

function logAction(action: string, result: string): void {
  console.log(`[AUTO_OPERATOR] ts=${timestamp()} action="${action}" result=${result}`);
}

async function patchOrder(orderId: string, payload: Record<string, unknown>): Promise<boolean> {
  const base = process.env.DATAVERSE_URL || "";
  const token = await getDataverseAccessToken();
  const entitySet = process.env.DATAVERSE_NEW_ORDERS_ENTITY_SET || "new_orderses";
  if (!base || !token || !orderId) return false;

  const url = `${base.replace(/\/$/, "")}/api/data/v9.2/${entitySet}(${orderId})`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json"
    },
    body: JSON.stringify(payload)
  });
  return res.ok;
}

async function createDataverseTask(subject: string): Promise<boolean> {
  const base = process.env.DATAVERSE_URL || "";
  const token = await getDataverseAccessToken();
  const entitySet = process.env.DATAVERSE_TASKS_ENTITY_SET || "tasks";
  if (!base || !token) return false;

  const url = `${base.replace(/\/$/, "")}/api/data/v9.2/${entitySet}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json"
    },
    body: JSON.stringify({
      subject,
      scheduledend: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
  });
  return res.ok;
}

export async function executeAction(input: ExecutionInput): Promise<ExecutionResult> {
  try {
    if (input.type === "FOLLOW_UP") {
      const out = {
        lastContacted: timestamp(),
        channel: "log",
        target: input.target || null
      };
      logAction(input.action, "executed");
      return { success: true, action: input.action, result: "executed", details: out };
    }

    if (input.type === "MOVE_TO_PRODUCTION") {
      const patched =
        input.orderId
          ? await patchOrder(input.orderId, {
              new_orderstatusnote: "Production Ready",
              new_notes: `Auto-update ${timestamp()}: moved to production`
            })
          : false;
      logAction(input.action, patched ? "executed" : "executed-local");
      return {
        success: true,
        action: input.action,
        result: "executed",
        details: {
          statusUpdatedTo: "Production Ready",
          orderId: input.orderId || null,
          persisted: patched
        }
      };
    }

    if (input.type === "CREATE_TASK") {
      const created = await createDataverseTask(input.action);
      logAction(input.action, created ? "executed" : "executed-local");
      return {
        success: true,
        action: input.action,
        result: "executed",
        details: { taskCreated: true, persisted: created }
      };
    }

    if (input.type === "FLAG_ISSUE") {
      const patched =
        input.orderId && input.note
          ? await patchOrder(input.orderId, {
              new_notes: `${input.note} | auto-flagged ${timestamp()}`
            })
          : false;
      logAction(input.action, patched ? "executed" : "executed-local");
      return {
        success: true,
        action: input.action,
        result: "executed",
        details: {
          flagged: true,
          orderId: input.orderId || null,
          persisted: patched
        }
      };
    }

    logAction(input.action, "skipped");
    return { success: false, action: input.action, result: "skipped" };
  } catch (err) {
    logAction(input.action, "failed");
    return {
      success: false,
      action: input.action,
      result: "failed",
      details: { error: err instanceof Error ? err.message : String(err) }
    };
  }
}
