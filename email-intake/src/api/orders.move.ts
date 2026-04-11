import { Router } from "express";
import { db } from "../db/client";

const router = Router();

router.post("/cheeky/orders/move", async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      return res.status(400).json({
        success: false,
        error: "orderId and status are required"
      });
    }

    const updateData: any = { status };

    if (status === "IN_PRODUCTION") {
      updateData.productionStartedAt = new Date();
    }

    if (status === "COMPLETED") {
      updateData.productionCompletedAt = new Date();
    }

    const updated = await db.order.update({
      where: { id: orderId },
      data: updateData
    });

    res.json({
      success: true,
      order: updated
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to move order"
    });
  }
});

export default router;
