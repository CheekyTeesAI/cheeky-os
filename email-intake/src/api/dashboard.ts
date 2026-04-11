import { Request, Response, Router } from "express";
import { db } from "../db/client";

const router = Router();

router.get("/cheeky/dashboard", async (_req: Request, res: Response) => {
  try {
    const orders = await db.order.findMany();

    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);

    const activeOrders = orders.filter((o) => o.status !== "COMPLETED").length;
    const inProduction = orders.filter((o) => o.status === "IN_PRODUCTION").length;
    const ready = orders.filter((o) => o.status === "READY").length;
    const completed = orders.filter((o) => o.status === "COMPLETED").length;

    res.json({
      success: true,
      metrics: {
        totalOrders: orders.length,
        totalRevenue,
        activeOrders,
        ready,
        inProduction,
        completed
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to load dashboard"
    });
  }
});

export default router;

