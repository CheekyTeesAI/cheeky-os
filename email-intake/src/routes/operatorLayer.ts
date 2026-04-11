import { Router, Request, Response } from "express";
import {
  getDailyPrintQueue,
  getFollowUpPriority,
  getHotUnpaidOrders,
  getNextBestActions,
  getOperatorBriefing,
  getOrdersCreatedToday,
} from "../services/operatorService";
import { logRevenueEvent } from "../services/revenueLogger";

const router = Router();

function safeJson(
  res: Response,
  fn: () => Promise<unknown>
): Promise<void> {
  return fn()
    .then((data) => {
      res.status(200).json(data);
    })
    .catch((err) => {
      console.error("[operatorLayer]", err);
      res.status(200).json({
        error: err instanceof Error ? err.message : "failed",
      });
    });
}

router.get("/print-queue", (_req: Request, res: Response) => {
  void safeJson(res, () => getDailyPrintQueue());
});

router.get("/follow-ups", (_req: Request, res: Response) => {
  void safeJson(res, () => getFollowUpPriority());
});

router.get("/hot-unpaid", (_req: Request, res: Response) => {
  void safeJson(res, () => getHotUnpaidOrders());
});

router.get("/orders-today", (_req: Request, res: Response) => {
  void safeJson(res, () => getOrdersCreatedToday());
});

router.get("/next-actions", (_req: Request, res: Response) => {
  logRevenueEvent("OPERATOR_NEXT_ACTIONS_REQUESTED", "operator", "GET");
  void safeJson(res, () => getNextBestActions());
});

router.get("/briefing", (_req: Request, res: Response) => {
  logRevenueEvent("OPERATOR_BRIEFING_REQUESTED", "operator", "GET");
  void safeJson(res, () => getOperatorBriefing());
});

export default router;
