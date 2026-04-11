import { Lead, LeadStage } from "../models/types";
import { validateLeadInput } from "../utils/validators";

const leads: Lead[] = [];

export function createLead(data: unknown): Lead {
  const validation = validateLeadInput(data);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(", "));
  }

  const input = (typeof data === "object" && data !== null
    ? data
    : {}) as Partial<Lead>;

  const now = new Date().toISOString();
  const lead: Lead = {
    id: `lead_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: String(input.name || "").trim(),
    company: input.company,
    phone: input.phone,
    email: input.email,
    source: input.source,
    orderType: input.orderType,
    estimatedValue: input.estimatedValue,
    stage: input.stage ?? LeadStage.NEW,
    nextAction: input.nextAction,
    nextActionDate: input.nextActionDate,
    status: input.status,
    depositPaid: input.depositPaid,
    notes: input.notes,
    createdAt: now,
    updatedAt: now
  };

  leads.push(lead);
  return lead;
}

export function getAllLeads(): Lead[] {
  return leads;
}

export function getActiveLeads(): Lead[] {
  return leads.filter((lead) => lead.stage !== LeadStage.WON && lead.stage !== LeadStage.LOST);
}

export function updateLead(id: string, updates: Partial<Lead>): Lead {
  const idx = leads.findIndex((lead) => lead.id === id);
  if (idx === -1) {
    throw new Error("Lead not found");
  }

  const current = leads[idx];
  const updated: Lead = {
    ...current,
    ...updates,
    id: current.id,
    updatedAt: new Date().toISOString()
  };

  leads[idx] = updated;
  return updated;
}