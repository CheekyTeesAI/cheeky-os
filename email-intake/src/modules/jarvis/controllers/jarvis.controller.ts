import type { Request, Response } from "express";
import { parseIntent } from "../services/intentParser.service";
import { routeIntent } from "../services/commandRouter.service";
import { formatJarvisResponse } from "../services/responseFormatter.service";
import { normalizeVoiceInput } from "../../control-layer/voiceAdapter.service";
import {
  approveAction,
  createApprovalRequest,
  requiresApproval,
  type ControlAction
} from "../../control-layer/approval.service";
import { evaluateControlRules } from "../../control-layer/controlRules.service";

function extractMoney(message: string): number {
  const m = message.match(/\$?\s*(\d{2,6})/);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function toControlAction(input: {
  message: string;
  normalizedMessage: string;
  parsedIntent: ReturnType<typeof parseIntent>;
}): ControlAction {
  const msg = input.normalizedMessage.toLowerCase();
  const changesProductionStatus =
    msg.includes("move") && msg.includes("production");
  const externalCommunication =
    msg.includes("follow up") ||
    msg.includes("send ") ||
    msg.includes("email") ||
    msg.includes("text");
  const amount = extractMoney(input.message);

  return {
    intent: input.parsedIntent.intent,
    message: input.normalizedMessage,
    parsedIntent: input.parsedIntent,
    amount,
    orderValue: amount,
    changesProductionStatus,
    externalCommunication
  };
}

export async function handleJarvisMessage(req: Request, res: Response): Promise<Response> {
  try {
    const body =
      typeof req.body === "object" && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "message is required"
      });
    }

    const normalized = normalizeVoiceInput(message);
    const parsed = parseIntent(normalized);
    const action = toControlAction({
      message,
      normalizedMessage: normalized,
      parsedIntent: parsed
    });

    const rules = evaluateControlRules(action);
    const approvalCheck = requiresApproval(action);

    if (!rules.allowed && approvalCheck.requiresApproval) {
      const approval = createApprovalRequest(action);
      return res.json({
        success: true,
        requiresApproval: true,
        approvalId: approval.approvalId,
        message: `${approval.message} ${approvalCheck.reason}`
      });
    }

    if (!rules.allowed) {
      return res.status(400).json({
        success: false,
        message: rules.reason
      });
    }

    const routed = await routeIntent(parsed);
    const out = formatJarvisResponse(parsed.intent, routed.result);
    return res.json({
      success: true,
      executed: true,
      message: out.summary,
      intent: out.intent,
      data: out.data
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Jarvis error"
    });
  }
}

export async function approveJarvisAction(req: Request, res: Response): Promise<Response> {
  try {
    const body =
      typeof req.body === "object" && req.body !== null
        ? (req.body as Record<string, unknown>)
        : {};
    const approvalId = String(body.approvalId ?? "").trim();
    if (!approvalId) {
      return res.status(400).json({
        success: false,
        error: "approvalId is required"
      });
    }

    const out = await approveAction(approvalId);
    if (!out.success) {
      return res.status(404).json(out);
    }
    return res.json({
      success: true,
      executed: true,
      message: out.message,
      data: out.result
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Approval error"
    });
  }
}
