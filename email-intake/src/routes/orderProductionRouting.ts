import { Router } from "express";
import { OrderNotFoundError } from "../services/orderEvaluator";
import { routeProductionForOrder } from "../services/productionRoutingService";
import { ActionNotAllowedError } from "../services/safetyGuard.service";

const router = Router();

router.post("/api/orders/:id/route-production", async (req, res) => {
  try {
    const orderId = String(req.params.id ?? "").trim();
    if (!orderId) {
      res.status(400).json({ success: false, error: "Missing order id" });
      return;
    }
    const result = await routeProductionForOrder(orderId);
    res.json({ success: true, result });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ success: false, error: err.message });
      return;
    }
    if (err instanceof ActionNotAllowedError) {
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    const message =
      err instanceof Error ? err.message : "Failed to route production";
    const client = message.toLowerCase().includes("missing order id");
    res.status(client ? 400 : 500).json({ success: false, error: message });
  }
});

export default router;
