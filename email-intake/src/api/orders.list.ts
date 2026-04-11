import { Router } from "express";
import { db } from "../db/client";

const router = Router();

router.get("/cheeky/orders", async (req, res) => {
  try {
    const { status } = req.query;

    const orders = await db.order.findMany({
      where: status ? { status: String(status) } : {},
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
