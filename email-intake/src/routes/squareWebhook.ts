import { Router, Request, Response } from "express";
import {
  processSquareWebhook,
  verifySquareSignature,
} from "../services/squareWebhookService";

const router = Router();

router.post(
  "/api/square/webhook",
  async (req: Request, res: Response) => {
    try {
      const raw =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const signature = req.header("x-square-hmacsha256-signature");
      verifySquareSignature(raw, signature);

      const result = await processSquareWebhook(req.body);
      if (result.success) {
        res.status(200).json({ success: true, result });
        return;
      }
      res.status(200).json({ success: false, error: result.message });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Webhook processing failed";
      res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;
