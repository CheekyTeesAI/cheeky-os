import { Activity } from "../models/types";
import { validateActivityInput } from "../utils/validators";

const activities: Activity[] = [];

export function logActivity(data: unknown): Activity {
  const validation = validateActivityInput(data);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(", "));
  }

  const input = (typeof data === "object" && data !== null
    ? data
    : {}) as Partial<Activity>;

  const activity: Activity = {
    id: `act_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    leadId: String(input.leadId || "").trim(),
    activityType: input.activityType!,
    summary: String(input.summary || ""),
    outcome: input.outcome,
    nextAction: input.nextAction,
    nextActionDate: input.nextActionDate,
    createdAt: new Date().toISOString()
  };

  activities.push(activity);
  return activity;
}

export function getActivitiesByLead(leadId: string): Activity[] {
  return activities.filter((activity) => activity.leadId === leadId);
}