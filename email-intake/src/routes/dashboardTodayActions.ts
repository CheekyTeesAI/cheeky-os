import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { getTodayActions } from "../services/todayService";
import { evaluateOperationSafety } from "../services/safetyGuardService";

const router = Router();

router.get(
  "/dashboard/today/actions",
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query ?? {};
    const limitRaw = q.limit;
    const pageSizeRaw = q.pageSize;
    const requestedLimit =
      limitRaw !== undefined ? Number(limitRaw) : undefined;
    const pageSize =
      pageSizeRaw !== undefined ? Number(pageSizeRaw) : undefined;

    const gate = evaluateOperationSafety({
      operation: "dashboard_today_actions",
      requestedLimit:
        requestedLimit !== undefined && !Number.isNaN(requestedLimit)
          ? requestedLimit
          : undefined,
      pageSize:
        pageSize !== undefined && !Number.isNaN(pageSize) ? pageSize : undefined,
      requireExplicitLimit: false,
    });
    if (!gate.allowed) {
      res
        .status(400)
        .json({ success: false, error: gate.reason ?? "Not allowed" });
      return;
    }

    const actions = await getTodayActions();
    res.json({ success: true, ...actions });
  })
);

export default router;
