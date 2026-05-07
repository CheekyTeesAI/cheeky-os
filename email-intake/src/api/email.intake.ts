import { Request, Response } from "express";
import {
  normalizeEmailIntake,
  toCreateOrderPipelineBody,
} from "../lib/intakeNormalizer";
import { createOrder } from "./orders.create";

export async function emailIntake(req: Request, res: Response) {
  try {
    const { subject, from, text } = req.body;

    if (!text && !subject) {
      return res.status(400).json({
        success: false,
        error: "Empty email"
      });
    }

    const normalized = normalizeEmailIntake(req.body);
    const pipelineBody = toCreateOrderPipelineBody(normalized);

    const mockReq: any = {
      body: pipelineBody,
    };

    const mockRes: any = {
      json: () => {},
      status: () => ({ json: () => {} })
    };

    await createOrder(mockReq, mockRes);

    console.log("Order created from email");

    return res.json({ success: true });

  } catch (err) {
    console.error("Email intake failed", err);
    return res.status(500).json({
      success: false,
      error: "Email intake failed"
    });
  }
}
