import { Request, Response, Router } from "express";
import { db } from "../db/client";

const router = Router();

router.get("/cheeky/orders/ready", async (_req: Request, res: Response) => {
  const orders = await db.order.findMany({
    where: { status: "READY" },
    orderBy: { createdAt: "desc" }
  });

  res.json({ success: true, orders });
});

router.get("/cheeky/orders/production", async (_req: Request, res: Response) => {
  const orders = await db.order.findMany({
    where: { status: "IN_PRODUCTION" },
    orderBy: { createdAt: "desc" }
  });

  res.json({ success: true, orders });
});

router.get("/cheeky/orders/completed", async (_req: Request, res: Response) => {
  const orders = await db.order.findMany({
    where: { status: "COMPLETED" },
    orderBy: { createdAt: "desc" }
  });

  res.json({ success: true, orders });
});

export default router;
