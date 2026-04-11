import { ApiResponse } from "../types";

export function errorResponse(stage: string, error: string): ApiResponse<never> {
  return { ok: false, stage, error };
}
