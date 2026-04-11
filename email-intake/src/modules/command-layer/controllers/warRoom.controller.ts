import type { Request, Response } from "express";
import {
  getRecentCustomers,
  getRecentEstimates,
  getRecentInvoices
} from "../services/squareEstimate.service";
import { getNextBestActions } from "../services/pipeline.service";
import { errorResponse } from "../utils/response";

function generateActions(input: {
  revenue: { recentTotal: number };
  pipeline: { estimatesCount: number; estimatedValue: number };
  activity: { recentCustomers: number };
}): string[] {
  const actions: string[] = [];
  const revenueLow = input.revenue.recentTotal < 3000;
  const pipelineLow = input.pipeline.estimatesCount < 5;

  if (pipelineLow) {
    actions.push("Send 10 follow-ups to past estimates immediately");
    actions.push("Message 5 local businesses");
    actions.push("Post urgent Facebook offer");
  }

  if (revenueLow) {
    actions.push("Close 1 open estimate today — call instead of text");
    actions.push("Offer discount for same-day deposit");
  }

  if (!pipelineLow && revenueLow) {
    actions.push("Call all open estimates");
    actions.push("Use two-option close");
    actions.push("Ask for deposit directly");
  }

  if (input.activity.recentCustomers < 5) {
    actions.push("Reach out to 10 past customers");
    actions.push("DM 10 Instagram followers");
    actions.push("Visit 2 businesses");
  }

  actions.push("Focus on $1k+ orders");
  actions.push("Ask for 50% deposit");

  return actions;
}

export async function getWarRoom(_req: Request, res: Response): Promise<Response> {
  try {
    const [invoicesRes, estimatesRes, customersRes] = await Promise.all([
      getRecentInvoices(),
      getRecentEstimates(),
      getRecentCustomers()
    ]);

    const recentTotal = invoicesRes.data.reduce((sum, row) => sum + (row.amount || 0), 0);
    const estimatesCount = estimatesRes.data.length;
    const estimatedValue = estimatesRes.data.reduce((sum, row) => sum + (row.amount || 0), 0);
    const recentCustomers = customersRes.data.length;

    let insight = "On track — push to close high-value deals";
    if (estimatesCount < 3 || estimatedValue < 3000) {
      insight = "Pipeline weak — prioritize outreach immediately";
    } else if (recentTotal < 4000) {
      insight = "Revenue lagging — close existing estimates now";
    }

    const data = {
      revenue: { recentTotal },
      pipeline: { estimatesCount, estimatedValue },
      activity: { recentCustomers },
      insight
    };
    const actions = generateActions(data);
    const nextBestActions = getNextBestActions();

    return res.json({
      success: true,
      data,
      actions,
      nextBestActions
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build war room";
    return res.status(500).json(errorResponse("War room failed", [message]));
  }
}
