import { Router } from "express";
import { db } from "../db/client";

const router = Router();

router.get("/cheeky/orders", async (req, res) => {
  try {
    const rawStatus = String(req.query.status || "").trim();
    const status = rawStatus.length > 0 ? rawStatus : null;

    const orders = await db.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, orders });
  } catch (err) {
    res.json({
      success: true,
      orders: []
    });
  }
});

export default router;
