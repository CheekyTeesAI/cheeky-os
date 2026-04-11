import { Lead, LeadStage, LeadStatus } from "../models/types";
import { getRecentEstimates, getRecentInvoices } from "./squareEstimate.service";
import { getActiveLeads } from "./lead.service";

type PipelineStageMap = {
  NEW: Lead[];
  CONTACTED: Lead[];
  QUOTED: Lead[];
  FOLLOW_UP: Lead[];
  CLOSE_ATTEMPT: Lead[];
  DEPOSIT_PAID: Lead[];
};

type PipelineResult = {
  summary: {
    openLeadCount: number;
    hotLeadCount: number;
    quotedValue: number;
    weightedPipelineValue: number;
  };
  stages: PipelineStageMap;
  nextActions: Lead[];
};

type NextBestAction = {
  name: string;
  value: number;
  stage: LeadStage;
  score: number;
  recommendedAction: string;
  script: string;
};

const STAGE_WEIGHTS: Record<keyof PipelineStageMap, number> = {
  NEW: 0.2,
  CONTACTED: 0.4,
  QUOTED: 0.6,
  FOLLOW_UP: 0.7,
  CLOSE_ATTEMPT: 0.85,
  DEPOSIT_PAID: 1
};

function safeValue(value?: number): number {
  return typeof value === "number" ? value : 0;
}

type SquareRow = {
  id: string;
  customerId: string;
  amount: number;
  status: string;
  createdAt: string;
};

let squarePipelineCache: Lead[] = [];
let squarePipelineRefreshing = false;

function mapEstimateToLead(row: SquareRow): Lead {
  return {
    id: `sq_est_${row.id}`,
    name: row.customerId || "Square Customer",
    company: "",
    estimatedValue: safeValue(row.amount),
    stage: LeadStage.QUOTED,
    status: LeadStatus.HOT,
    nextAction: "Follow up on estimate",
    nextActionDate: row.createdAt,
    createdAt: row.createdAt,
    updatedAt: row.createdAt
  };
}

function mapInvoiceToLead(row: SquareRow): Lead {
  const paid = String(row.status || "").toUpperCase() === "PAID";
  return {
    id: `sq_inv_${row.id}`,
    name: row.customerId || "Square Customer",
    company: "",
    estimatedValue: safeValue(row.amount),
    stage: paid ? LeadStage.DEPOSIT_PAID : LeadStage.CLOSE_ATTEMPT,
    status: LeadStatus.HOT,
    nextAction: paid ? "Confirm production details" : "Close invoice / collect payment",
    nextActionDate: row.createdAt,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    depositPaid: paid
  };
}

export async function getSquarePipeline(): Promise<Lead[]> {
  const [estimatesRes, invoicesRes] = await Promise.all([
    getRecentEstimates(),
    getRecentInvoices()
  ]);
  const estimateLeads = (estimatesRes.data as SquareRow[]).map(mapEstimateToLead);
  const invoiceLeads = (invoicesRes.data as SquareRow[]).map(mapInvoiceToLead);
  return [...estimateLeads, ...invoiceLeads];
}

function refreshSquarePipelineCache(): void {
  if (squarePipelineRefreshing) return;
  squarePipelineRefreshing = true;
  getSquarePipeline()
    .then((rows) => {
      squarePipelineCache = rows;
    })
    .catch(() => {
      // Keep last cache on Square read errors.
    })
    .finally(() => {
      squarePipelineRefreshing = false;
    });
}

function getCombinedPipelineLeads(): Lead[] {
  const localLeads = getActiveLeads();
  const combined = [...localLeads, ...squarePipelineCache];
  const deduped = Array.from(new Map(combined.map((lead) => [lead.id, lead])).values());
  return deduped.filter((lead) => lead.stage !== LeadStage.WON && lead.stage !== LeadStage.LOST);
}

export function getPipeline(): PipelineResult {
  refreshSquarePipelineCache();
  const activeLeads = getCombinedPipelineLeads();

  const stages: PipelineStageMap = {
    NEW: [],
    CONTACTED: [],
    QUOTED: [],
    FOLLOW_UP: [],
    CLOSE_ATTEMPT: [],
    DEPOSIT_PAID: []
  };

  for (const lead of activeLeads) {
    if (lead.stage in stages) {
      const stageKey = lead.stage as keyof PipelineStageMap;
      stages[stageKey].push(lead);
    }
  }

  const quotedValue =
    [...stages.QUOTED, ...stages.FOLLOW_UP, ...stages.CLOSE_ATTEMPT].reduce(
      (sum, lead) => sum + safeValue(lead.estimatedValue),
      0
    );

  const weightedPipelineValue = (
    Object.keys(stages) as Array<keyof PipelineStageMap>
  ).reduce((sum, stageKey) => {
    const stageTotal = stages[stageKey].reduce(
      (inner, lead) => inner + safeValue(lead.estimatedValue),
      0
    );
    return sum + stageTotal * STAGE_WEIGHTS[stageKey];
  }, 0);

  const nextActions = activeLeads
    .filter((lead) => typeof lead.nextActionDate === "string" && lead.nextActionDate.trim() !== "")
    .sort((a, b) => {
      const at = new Date(a.nextActionDate as string).getTime();
      const bt = new Date(b.nextActionDate as string).getTime();
      return at - bt;
    });

  return {
    summary: {
      openLeadCount: activeLeads.length,
      hotLeadCount: activeLeads.filter((lead) => lead.status === LeadStatus.HOT).length,
      quotedValue,
      weightedPipelineValue
    },
    stages,
    nextActions
  };
}

function stageScore(stage: LeadStage): number {
  if (stage === LeadStage.CLOSE_ATTEMPT) return 5;
  if (stage === LeadStage.FOLLOW_UP) return 4;
  if (stage === LeadStage.QUOTED) return 3;
  if (stage === LeadStage.CONTACTED) return 2;
  if (stage === LeadStage.NEW) return 1;
  return 0;
}

function valueScore(value: number): number {
  if (value > 2000) return 5;
  if (value >= 1000) return 3;
  return 1;
}

function ageScore(createdAt?: string): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  const ageDays = (Date.now() - t) / (24 * 60 * 60 * 1000);
  if (ageDays > 5) return 5;
  if (ageDays > 2) return 3;
  return 0;
}

function statusScore(status?: LeadStatus): number {
  if (status === LeadStatus.HOT) return 3;
  if (status === LeadStatus.WARM) return 2;
  return 0;
}

function recommendedActionForStage(stage: LeadStage): string {
  if (stage === LeadStage.CLOSE_ATTEMPT) return "Call and ask for deposit";
  if (stage === LeadStage.FOLLOW_UP) return "Send follow-up message";
  if (stage === LeadStage.QUOTED) return "Push to close — use urgency";
  return "Send follow-up message";
}

export function getNextBestActions(): NextBestAction[] {
  refreshSquarePipelineCache();
  const leads = getCombinedPipelineLeads();

  return leads
    .map((lead) => {
      const value = safeValue(lead.estimatedValue);
      const score =
        valueScore(value) +
        stageScore(lead.stage) +
        ageScore(lead.createdAt) +
        statusScore(lead.status);
      const name = lead.name || lead.company || "Customer";
      const recommendedAction = recommendedActionForStage(lead.stage);
      const script =
        `Hey ${name}, just checking in on your order for $${value}.\n\n` +
        "I’ve got production slots closing for this week — if you want to move forward, I can lock it in today with the deposit.";
      return {
        name,
        value,
        stage: lead.stage,
        score,
        recommendedAction,
        script
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}