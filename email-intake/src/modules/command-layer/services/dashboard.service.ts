import { Lead, LeadStage, LeadStatus } from "../models/types";
import { getActiveLeads } from "./lead.service";

type DashboardResult = {
  targets: {
    dailyRevenueTarget: number;
  };
  totals: {
    quotedToday: number;
    depositsCollectedToday: number;
    openHotLeads: number;
  };
  actions: {
    followUpsDueToday: Lead[];
    hotLeads: Lead[];
    quotesToSend: Lead[];
  };
  pace: {
    status: "ON_TRACK" | "BEHIND";
  };
};

const DAILY_REVENUE_TARGET = 4000;

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function leadDateKey(value?: string): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

function safeValue(value?: number): number {
  return typeof value === "number" ? value : 0;
}

export function getTodayDashboard(): DashboardResult {
  const activeLeads = getActiveLeads();
  const today = dateKey(new Date());

  const quotedToday = activeLeads.reduce((sum, lead) => {
    const updated = leadDateKey(lead.updatedAt);
    if (updated === today && typeof lead.estimatedValue === "number") {
      return sum + lead.estimatedValue;
    }
    return sum;
  }, 0);

  const depositsCollectedToday = activeLeads.reduce((sum, lead) => {
    const updated = leadDateKey(lead.updatedAt);
    if (lead.depositPaid === true && updated === today) {
      return sum + safeValue(lead.estimatedValue);
    }
    return sum;
  }, 0);

  const hotLeads = activeLeads.filter((lead) => lead.status === LeadStatus.HOT);

  const followUpsDueToday = activeLeads.filter((lead) => {
    const nextDate = leadDateKey(lead.nextActionDate);
    return nextDate === today;
  });

  const quotesToSend = activeLeads.filter(
    (lead) =>
      (lead.stage === LeadStage.CONTACTED || lead.stage === LeadStage.NEW) &&
      typeof lead.estimatedValue === "number"
  );

  return {
    targets: {
      dailyRevenueTarget: DAILY_REVENUE_TARGET
    },
    totals: {
      quotedToday,
      depositsCollectedToday,
      openHotLeads: hotLeads.length
    },
    actions: {
      followUpsDueToday,
      hotLeads,
      quotesToSend
    },
    pace: {
      status: quotedToday >= DAILY_REVENUE_TARGET ? "ON_TRACK" : "BEHIND"
    }
  };
}