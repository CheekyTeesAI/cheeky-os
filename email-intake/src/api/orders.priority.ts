import { Router } from "express";
import { db } from "../db/client";

const router = Router();

router.get("/cheeky/orders/priority", async (_req, res) => {
  try {
    const orders = await db.order.findMany();

    const sorted = orders.sort((a, b) => {
      // RUSH FIRST
      if (a.isRush && !b.isRush) return -1;
      if (!a.isRush && b.isRush) return 1;

      const priorityOrder = (status: string) => {
        if (status === "READY") return 1;
        if (status === "IN_PRODUCTION") return 2;
        return 3;
      };

      const pA = priorityOrder(a.status);
      const pB = priorityOrder(b.status);

      if (pA !== pB) return pA - pB;

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    res.json({ success: true, orders: sorted });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to calculate priority"
    });
  }
});

export default router;
