import express, { Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("../../lib/config");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createOrderFromPayment } = require("../../lib/orderEngine");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { updateEstimateStatus } = require("../../lib/estimateStore");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logEvent } = require("../../lib/eventStore");

const router = express.Router();

router.post("/", (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const customer = body.customer != null ? String(body.customer).trim() : "";
    if (!customer) {
      return res.status(400).json({
        success: false,
        error: "validation",
        message: "customer is required",
      });
    }
    if (
      body.depositPaid === undefined &&
      body.squarePaymentId === undefined &&
      body.totalAmount === undefined
    ) {
      return res.status(400).json({
        success: false,
        error: "validation",
        message: "provide depositPaid, squarePaymentId, and/or totalAmount",
      });
    }

    const { order, tasks } = createOrderFromPayment(body);

    const estId = body.estimateId != null ? String(body.estimateId).trim() : "";
    if (estId) {
      updateEstimateStatus(estId, "paid");
      try {
        logEvent("estimate_converted_to_paid", {
          estimateId: estId,
          orderId: order && order.id,
        });
      } catch (_) {}
    }

    res.json({
      success: true,
      order,
      tasks,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[payment]", msg);
    res.status(500).json({
      success: false,
      error: "payment_flow_failed",
      message: msg,
    });
  }
});

export default router;
