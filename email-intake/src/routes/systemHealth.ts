import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get(
  "/system/health",
  asyncHandler(async (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date(),
      memory: process.memoryUsage(),
    });
  })
);

export default router;
