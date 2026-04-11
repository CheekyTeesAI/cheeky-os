export interface BrainOutput {
  intent: "CREATE_INVOICE" | "UNKNOWN";
  /** Populated when intent is CREATE_INVOICE; may be empty for UNKNOWN. */
  customerName: string;
  quantity: number;
  unitPrice: number;
  confidence: number;
  /** Optional trace for debugging / future telemetry (not required by gatekeeper). */
  source?: "openai" | "mock" | "fallback";
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  stage?: string;
}

export type LastRun = {
  input: string;
  output: unknown;
  timestamp: number;
};
