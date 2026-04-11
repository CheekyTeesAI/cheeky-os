import type { Request, Response } from "express";
import { successResponse } from "../../command-layer/utils/response";
import { getBusinessState } from "../services/businessState.service";

export async function runBusiness(_req: Request, res: Response): Promise<Response> {
  try {
    const data = await getBusinessState();
    return res.json(successResponse(data, "Business state loaded"));
  } catch {
    return res.status(500).json({
      success: false,
      message: "Business state unavailable",
      data: null
    });
  }
}
