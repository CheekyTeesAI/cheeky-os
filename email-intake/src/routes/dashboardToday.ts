import { Router, Request, Response } from "express";
import { getTodayDashboard } from "../services/dashboardService";

const router = Router();

router.get("/api/dashboard/today", async (_req: Request, res: Response) => {
  try {
    const result = await getTodayDashboard();
    res.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load dashboard";
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
