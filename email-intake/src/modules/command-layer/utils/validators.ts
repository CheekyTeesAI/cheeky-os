import { ActivityType, LeadStage } from "../models/types";

type ValidationResult = {
  isValid: boolean;
  errors: string[];
};

function asRecord(data: unknown): Record<string, unknown> {
  return typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
}

export function validateLeadInput(data: unknown): ValidationResult {
  const input = asRecord(data);
  const errors: string[] = [];

  const name = input.name;
  if (typeof name !== "string" || name.trim() === "") {
    errors.push("name is required");
  }

  if (
    input.estimatedValue !== undefined &&
    typeof input.estimatedValue !== "number"
  ) {
    errors.push("estimatedValue must be a number");
  }

  if (
    input.stage !== undefined &&
    !Object.values(LeadStage).includes(String(input.stage) as LeadStage)
  ) {
    errors.push("stage must be a valid LeadStage");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateActivityInput(data: unknown): ValidationResult {
  const input = asRecord(data);
  const errors: string[] = [];

  const leadId = input.leadId;
  if (typeof leadId !== "string" || leadId.trim() === "") {
    errors.push("leadId is required");
  }

  const activityType = input.activityType;
  if (
    typeof activityType !== "string" ||
    !Object.values(ActivityType).includes(activityType as ActivityType)
  ) {
    errors.push("activityType must be a valid ActivityType");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}