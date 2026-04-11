import { Router, Request, Response } from "express";
import { sendEstimate } from "../services/estimateSendService";
import {
  generateSalesMessage,
  runSalesAgentForOrder,
} from "../services/salesAgent";
import { db } from "../db/client";
import {
  runPaymentClose,
  scoreOrderForClosing,
} from "../services/paymentCloseEngine";

const router = Router();

function inferSource(order: {
  squarePaymentId?: string | null;
  squareOrderId?: string | null;
}): string {
  if (order.squarePaymentId || order.squareOrderId) return "SQUARE";
  return "EMAIL";
}

router.post(
  "/actions/orders/:orderId/send-estimate",
  async (req: Request, res: Response) => {
    try {
      const orderId = String(req.params.orderId ?? "").trim();
      if (!orderId) {
        res.status(200).json({ error: "missing orderId" });
        return;
      }
      const out = await sendEstimate(orderId);
      res.status(200).json(out);
    } catch (err) {
      console.error("[actions/send-estimate]", err);
      res.status(200).json({
        error: err instanceof Error ? err.message : "failed",
        orderId: req.params.orderId,
      });
    }
  }
);

router.post(
  "/actions/orders/:orderId/sales-message",
  async (req: Request, res: Response) => {
    try {
      const orderId = String(req.params.orderId ?? "").trim();
      if (!orderId) {
        res.status(200).json({ error: "missing orderId" });
        return;
      }
      const r = await generateSalesMessage(orderId, req.body ?? {});
      res.status(200).json({
        subject: r.subject,
        body: r.body,
        messageType: r.messageType,
        skipped: r.skipped,
      });
    } catch (err) {
      console.error("[actions/sales-message]", err);
      res.status(200).json({
        error: err instanceof Error ? err.message : "failed",
        skipped: true,
      });
    }
  }
);

router.post(
  "/actions/orders/:orderId/run-sales-agent",
  async (req: Request, res: Response) => {
    try {
      const orderId = String(req.params.orderId ?? "").trim();
      if (!orderId) {
        res.status(200).json({ error: "missing orderId" });
        return;
      }
      const body = (req.body ?? {}) as Record<string, unknown>;
      const autoSend = body.autoSend !== false;
      const channel =
        body.channel === "email" ? "email" : "console";
      const r = await runSalesAgentForOrder(orderId, {
        autoSend,
        channel,
        reason: (body.reason as any) ?? "quote_followup",
        force: body.force === true,
      });
      res.status(200).json(r);
    } catch (err) {
      console.error("[actions/run-sales-agent]", err);
      res.status(200).json({
        error: err instanceof Error ? err.message : "failed",
        skipped: true,
      });
    }
  }
);

router.get("/actions/sales/queue", async (_req: Request, res: Response) => {
  try {
    const rows = await db.order.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        customer: { select: { name: true, email: true } },
        _count: { select: { lineItems: true, tasks: true } },
      },
    });

    const actionable = rows.filter((o) =>
      ["QUOTE", "NEEDS_REVIEW"].includes(String(o.status))
    );

    res.status(200).json(
      actionable.map((o) => ({
        id: o.id,
        status: o.status,
        source: inferSource(o),
        customerName: o.customer?.name ?? null,
        customerEmail: o.customer?.email ?? null,
        createdAt: o.createdAt,
        lineItemCount: o._count.lineItems,
        taskCount: o._count.tasks,
      }))
    );
  } catch (err) {
    console.error("[actions/sales/queue]", err);
    res.status(200).json([]);
  }
});

router.post("/actions/payments/run-close", async (_req: Request, res: Response) => {
  try {
    const out = await runPaymentClose();
    res.status(200).json(out);
  } catch (err) {
    console.error("[actions/payments/run-close]", err);
    res.status(200).json({
      processed: 0,
      nudged: 0,
      skipped: 0,
      topScores: [],
      error: err instanceof Error ? err.message : "failed",
    });
  }
});

router.get("/actions/payments/queue", async (_req: Request, res: Response) => {
  try {
    const rows = await db.order.findMany({
      where: { deletedAt: null },
      include: {
        customer: { select: { name: true, email: true } },
        lineItems: true,
        tasks: true,
      },
    });

    const eligible = rows.filter((o) => {
      if (String(o.status).toUpperCase() !== "QUOTE") return false;
      const dep = Number(o.depositAmount ?? 0);
      const tot = Number(o.totalAmount ?? 0);
      return dep < tot || dep === 0;
    });

    const scored = eligible
      .map((o) => ({
        orderId: o.id,
        score: scoreOrderForClosing(o),
        totalAmount: o.totalAmount,
        depositAmount: o.depositAmount,
        customerName: o.customer?.name ?? null,
        createdAt: o.createdAt,
      }))
      .sort((a, b) => b.score - a.score);

    res.status(200).json(scored);
  } catch (err) {
    console.error("[actions/payments/queue]", err);
    res.status(200).json([]);
  }
});

export default router;
