import { Router } from "express";
import { db } from "../db/client";

const router = Router();

router.post("/cheeky/orders/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updated = await db.order.update({
      where: { id },
      data: { status }
    });

    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to update order status"
    });
  }
});

export default router;
