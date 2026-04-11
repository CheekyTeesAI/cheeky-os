import { Router } from "express";
import { handleSquarePaymentWebhook } from "../services/squarePaymentHandler";

const router = Router();

router.post("/webhooks/square", async (req, res) => {
  try {
    await handleSquarePaymentWebhook(req.body ?? {});
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[square.webhook] Failed to process webhook", error);
    res.status(200).json({ ok: true });
  }
});

export default router;
