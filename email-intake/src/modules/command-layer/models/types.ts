export enum LeadStage {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  QUOTED = "QUOTED",
  FOLLOW_UP = "FOLLOW_UP",
  CLOSE_ATTEMPT = "CLOSE_ATTEMPT",
  DEPOSIT_PAID = "DEPOSIT_PAID",
  WON = "WON",
  LOST = "LOST"
}

export enum LeadStatus {
  HOT = "HOT",
  WARM = "WARM",
  COLD = "COLD"
}

export enum ActivityType {
  call = "call",
  text = "text",
  email = "email",
  dm = "dm",
  walkin = "walkin",
  quote = "quote",
  note = "note"
}

export type Lead = {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  source?: string;
  orderType?: string;
  estimatedValue?: number;
  stage: LeadStage;
  nextAction?: string;
  nextActionDate?: string;
  status?: LeadStatus;
  depositPaid?: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Activity = {
  id: string;
  leadId: string;
  activityType: ActivityType;
  summary: string;
  outcome?: string;
  nextAction?: string;
  nextActionDate?: string;
  createdAt?: string;
};