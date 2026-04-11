import type { Request, Response } from "express";
import { createLead as createLeadService } from "../services/lead.service";
import { logActivity as logActivityService } from "../services/activity.service";
import { getTodayDashboard } from "../services/dashboard.service";
import { SquareEstimateServicePlaceholder } from "../services/squareEstimate.service";
import { successResponse, errorResponse } from "../utils/response";
import { getSystemState } from "../../core/services/systemState.service";
import { getNextBestActions } from "../../decision-engine/decisionEngine.service";
import { runAutoOperator } from "../../auto-operator/autoOperator.service";
import { executeAction as executeOperatorAction } from "../../auto-operator/actionExecutor.service";
import { classifyActionType } from "../../auto-operator/safetyGuard.service";

export function createLead(req: Request, res: Response): Response {
  try {
    const lead = createLeadService(req.body);
    return res.json(successResponse(lead, "Lead created"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create lead";
    return res.status(400).json(errorResponse("Lead creation failed", [message]));
  }
}

export function logActivity(req: Request, res: Response): Response {
  try {
    const activity = logActivityService(req.body);
    return res.json(successResponse(activity, "Activity logged"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to log activity";
    return res.status(400).json(errorResponse("Activity logging failed", [message]));
  }
}

export async function getPipeline(_req: Request, res: Response): Promise<Response> {
  try {
    const system = await getSystemState();
    const pipeline = {
      salesPipeline: system.salesPipeline,
      productionQueue: system.productionQueue,
      orders: system.orders,
      tasks: system.tasks
    };
    return res.json(successResponse(pipeline, "Pipeline loaded"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load pipeline";
    return res.status(500).json(errorResponse("Pipeline load failed", [message]));
  }
}

export async function getDashboard(_req: Request, res: Response): Promise<Response> {
  try {
    const system = await getSystemState();
    const legacy = getTodayDashboard();
    const dashboard = {
      totals: {
        activeOrders: system.orders.length,
        activeTasks: system.tasks.length,
        activeLeads: system.leads.length
      },
      productionQueueTop: system.productionQueue.slice(0, 10),
      salesPipelineTop: system.salesPipeline.slice(0, 10),
      legacy
    };
    return res.json(successResponse(dashboard, "Dashboard loaded"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load dashboard";
    return res.status(500).json(errorResponse("Dashboard load failed", [message]));
  }
}

export async function createDraftEstimate(req: Request, res: Response): Promise<Response> {
  try {
    const svc = new SquareEstimateServicePlaceholder() as unknown as {
      createDraftEstimate?: (input: unknown) => Promise<unknown> | unknown;
    };
    const out = svc.createDraftEstimate
      ? await svc.createDraftEstimate(req.body)
      : { estimateId: "mock-id", status: "DRAFT" };
    return res.json(successResponse(out, "Draft estimate created"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create draft estimate";
    return res.status(500).json(errorResponse("Draft estimate failed", [message]));
  }
}

export async function getNextActions(_req: Request, res: Response): Promise<Response> {
  try {
    const actions = await getNextBestActions();
    return res.json({
      success: true,
      actions
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load next actions";
    return res.status(500).json(errorResponse("Next actions failed", [message]));
  }
}

export function executeAction(req: Request, res: Response): Response {
  try {
    const body =
      typeof req.body === "object" && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
    const action = String(body.action ?? "").trim();
    const target = String(body.target ?? "").trim();

    if (!action) {
      return res.status(400).json(errorResponse("Invalid action", ["action is required"]));
    }

    const actionType = classifyActionType(action);
    if (actionType === "UNKNOWN") {
      return res.status(400).json(errorResponse("Invalid action", ["action is unclear"]));
    }
    void executeOperatorAction({
      type: actionType,
      action,
      target: target || null
    })
      .then((out) => {
        console.log(
          `[EXECUTE_ACTION] ts=${new Date().toISOString()} action=${action} result=${out.result}`
        );
      })
      .catch(() => {
        // no-op
      });
    return res.json({
      success: true,
      logged: true,
      action,
      target: target || null,
      result: "queued"
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to execute action";
    return res.status(500).json(errorResponse("Execute action failed", [message]));
  }
}

export async function runBusiness(req: Request, res: Response): Promise<Response> {
  try {
    const body =
      typeof req.body === "object" && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
    const mode = String(body.mode ?? "").trim().toLowerCase() === "dry-run" ? "dry-run" : "execute";
    const out = await runAutoOperator(mode);
    return res.json({
      success: true,
      mode,
      ...out
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run auto operator";
    return res.status(500).json(errorResponse("Run business failed", [message]));
  }
}