import express, { Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../lib/config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  getOrders,
  updateOrderStatus,
  updateOrderRouting,
  getOrderMetrics,
} = require("../../lib/orderStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logEvent } = require("../../lib/eventStore");

const router = express.Router();

router.get("/", (_req: Request, res: Response) => {
  try {
    res.json({ success: true, orders: getOrders() });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.get("/metrics", (_req: Request, res: Response) => {
  try {
    const m = getOrderMetrics();
    res.json({ success: true, ...m });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.post("/status", (req: Request, res: Response) => {
  try {
    const { id, status } = req.body as { id?: string; status?: string };
    if (!id || !status) {
      return res.status(400).json({
        success: false,
        error: "missing id/status",
      });
    }
    const updated = updateOrderStatus(id, status);
    if (!updated) {
      return res.status(404).json({ success: false, error: "order not found" });
    }
    try {
      logEvent("order_status_updated", { orderId: id, status });
    } catch (_) {}
    res.json({ success: true, order: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

router.post("/routing", (req: Request, res: Response) => {
  try {
    const { id, routing } = req.body as { id?: string; routing?: string };
    if (!id || !routing) {
      return res.status(400).json({
        success: false,
        error: "missing id/routing",
      });
    }
    const updated = updateOrderRouting(id, routing);
    if (!updated) {
      return res.status(404).json({ success: false, error: "order not found" });
    }
    try {
      logEvent("order_routing_updated", { orderId: id, routing });
    } catch (_) {}
    res.json({ success: true, order: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
