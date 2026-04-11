import type { Request, Response } from "express";
import { autoFollowup } from "./followup.controller";
import { getNextBestActions, getPipeline } from "../services/pipeline.service";
import { errorResponse } from "../utils/response";

type FollowupSummary = {
  sent: number;
  failed: number;
};

function extractFollowupSummary(payload: unknown): FollowupSummary {
  const obj = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
  return {
    sent: typeof obj.sent === "number" ? obj.sent : 0,
    failed: typeof obj.failed === "number" ? obj.failed : 0
  };
}

export async function runDay(_req: Request, res: Response): Promise<Response> {
  try {
    getPipeline();
    const nextBestActions = getNextBestActions();
    const priorityDeals = nextBestActions.slice(0, 3).map((deal) => ({
      name: deal.name,
      value: deal.value,
      action: deal.recommendedAction,
      script: deal.script
    }));

    let followupPayload: unknown = { sent: 0, failed: 0 };
    const fakeRes = {
      status: (_code: number) => fakeRes,
      json: (body: unknown) => {
        followupPayload = body;
        return fakeRes;
      }
    } as unknown as Response;
    await autoFollowup({} as Request, fakeRes);
    const followups = extractFollowupSummary(followupPayload);

    return res.json({
      success: true,
      plan: {
        priorityDeals,
        actions: priorityDeals.map((d) => d.action),
        followups
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to run day plan";
    return res.status(500).json(errorResponse("Run day failed", [message]));
  }
}
