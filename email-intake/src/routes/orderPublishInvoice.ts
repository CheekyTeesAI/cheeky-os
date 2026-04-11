import { Router } from "express";
import { OrderNotFoundError } from "../services/orderEvaluator";
import { publishAndSendSquareInvoiceForOrder } from "../services/squareInvoicePublishService";
import { ActionNotAllowedError } from "../services/safetyGuard.service";

const router = Router();

router.post("/api/orders/:id/publish-invoice", async (req, res) => {
  try {
    const orderId = String(req.params.id ?? "").trim();
    if (!orderId) {
      res.status(400).json({ success: false, error: "Missing order id" });
      return;
    }
    const result = await publishAndSendSquareInvoiceForOrder(orderId);
    res.json({ success: true, result });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({
        success: false,
        error: err.message,
      });
      return;
    }
    if (err instanceof ActionNotAllowedError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    const message =
      err instanceof Error ? err.message : "Failed to publish Square invoice";
    const lower = message.toLowerCase();
    const clientError =
      lower.includes("must be approved") ||
      lower.includes("draft invoice does not exist") ||
      lower.includes("must be invoice_drafted") ||
      lower.includes("missing order id");
    res.status(clientError ? 400 : 500).json({
      success: false,
      error: message,
    });
  }
});

export default router;
