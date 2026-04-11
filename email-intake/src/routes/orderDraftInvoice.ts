import { Router } from "express";
import {
  createSquareDraftInvoiceForOrder,
  OrderNotEligibleForInvoiceError,
} from "../services/squareInvoiceService";
import { OrderNotFoundError } from "../services/orderEvaluator";

const router = Router();

router.post(
  "/api/orders/:id/create-draft-invoice",
  async (req, res) => {
    try {
      const orderId = String(req.params.id ?? "").trim();
      if (!orderId) {
        res.status(400).json({ success: false, error: "Missing order id" });
        return;
      }
      const result = await createSquareDraftInvoiceForOrder(orderId);
      res.json({ success: true, result });
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        res.status(404).json({ success: false, error: err.message });
        return;
      }
      if (err instanceof OrderNotEligibleForInvoiceError) {
        res.status(400).json({ success: false, error: err.message });
        return;
      }
      const message =
        err instanceof Error ? err.message : "Failed to create draft invoice";
      res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;
