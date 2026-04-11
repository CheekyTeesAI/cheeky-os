import { Request, Response } from "express";
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

    // VERY SIMPLE PARSING (safe)
    const customerName = from || "Email Customer";
    const email = from || "";
    const items = [subject || "Custom Order Request"];
    const notes = text || "";

    const mockReq: any = {
      body: {
        customerName,
        email,
        items,
        notes
      }
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
