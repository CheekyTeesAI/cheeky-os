import { getNextBestActions, getPipeline } from "../../command-layer/services/pipeline.service";
import {
  getRecentCustomers,
  getRecentEstimates,
  getRecentInvoices
} from "../../command-layer/services/squareEstimate.service";
import { LeadStage } from "../../command-layer/models/types";

export type NextBestActionRow = {
  name: string;
  value: number;
  stage: LeadStage;
  score: number;
  recommendedAction: string;
  script: string;
};

export type SalesState = {
  revenue: {
    recentInvoiceTotal: number;
    unpaidInvoiceCount: number;
    estimateCount: number;
    estimateValue: number;
  };
  pipeline: {
    openDeals: number;
    hotDeals: number;
    nextBestActions: NextBestActionRow[];
  };
  activity: {
    recentCustomers: number;
  };
};

function safeAmount(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export async function getSalesState(): Promise<SalesState> {
  let invoices: Array<{ amount: number; status: string }> = [];
  let estimates: Array<{ amount: number }> = [];
  let customers: Array<unknown> = [];

  try {
    const [invRes, estRes, custRes] = await Promise.all([
      getRecentInvoices(),
      getRecentEstimates(),
      getRecentCustomers()
    ]);
    if (invRes.success) {
      invoices = invRes.data.map((r) => ({
        amount: safeAmount((r as { amount?: number }).amount),
        status: String((r as { status?: string }).status ?? "")
      }));
    }
    if (estRes.success) {
      estimates = estRes.data.map((r) => ({
        amount: safeAmount((r as { amount?: number }).amount)
      }));
    }
    if (custRes.success) {
      customers = custRes.data;
    }
  } catch {
    invoices = [];
    estimates = [];
    customers = [];
  }

  const recentInvoiceTotal = invoices.reduce((s, r) => s + r.amount, 0);
  const unpaidInvoiceCount = invoices.filter(
    (r) => String(r.status).toUpperCase() !== "PAID"
  ).length;
  const estimateCount = estimates.length;
  const estimateValue = estimates.reduce((s, r) => s + r.amount, 0);

  let pipelineSnapshot = {
    openLeadCount: 0,
    hotLeadCount: 0
  };
  let nextBestActions: NextBestActionRow[] = [];

  try {
    const pipeline = getPipeline();
    pipelineSnapshot = {
      openLeadCount: pipeline.summary.openLeadCount,
      hotLeadCount: pipeline.summary.hotLeadCount
    };
    nextBestActions = getNextBestActions().map((a) => ({
      name: a.name,
      value: a.value,
      stage: a.stage,
      score: a.score,
      recommendedAction: a.recommendedAction,
      script: a.script
    }));
  } catch {
    // leave defaults
  }

  return {
    revenue: {
      recentInvoiceTotal,
      unpaidInvoiceCount,
      estimateCount,
      estimateValue
    },
    pipeline: {
      openDeals: pipelineSnapshot.openLeadCount,
      hotDeals: pipelineSnapshot.hotLeadCount,
      nextBestActions
    },
    activity: {
      recentCustomers: customers.length
    }
  };
}
