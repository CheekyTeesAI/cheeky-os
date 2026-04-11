import { Router, Request, Response } from "express";
import { db } from "../db/client";

const router = Router();

function startOfTodayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

router.get("/dashboard/orders", async (_req: Request, res: Response) => {
  try {
    const orders = await (db as any).order.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        source: true,
        totalAmount: true,
        depositAmount: true,
        createdAt: true,
        customer: { select: { name: true, email: true } },
        _count: { select: { tasks: true } },
      },
    });
    res.json(orders);
  } catch (error) {
    console.error("[dashboard/orders] Failed", error);
    res.status(500).json([]);
  }
});

router.get("/dashboard/orders/today", async (_req: Request, res: Response) => {
  try {
    const today = startOfTodayLocal();
    const orders = await (db as any).order.findMany({
      where: { createdAt: { gte: today } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        source: true,
        totalAmount: true,
        depositAmount: true,
        createdAt: true,
        customer: { select: { name: true, email: true } },
        _count: { select: { tasks: true } },
      },
    });
    res.json(orders);
  } catch (error) {
    console.error("[dashboard/orders/today] Failed", error);
    res.status(500).json([]);
  }
});

router.get("/dashboard/tasks/pending", async (_req: Request, res: Response) => {
  try {
    const tasks = await (db as any).task.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        order: {
          select: {
            id: true,
            status: true,
            customer: { select: { name: true } },
          },
        },
      },
    });
    res.json(tasks);
  } catch (error) {
    console.error("[dashboard/tasks/pending] Failed", error);
    res.status(500).json([]);
  }
});

router.get("/dashboard/summary", async (_req: Request, res: Response) => {
  try {
    const today = startOfTodayLocal();

    const [ordersToday, pendingTasks, unpaidOrders] = await Promise.all([
      (db as any).order.count({ where: { createdAt: { gte: today } } }),
      (db as any).task.count({ where: { status: "PENDING" } }),
      (db as any).order.findMany({
        where: { status: { not: "PAID" } },
        select: { totalAmount: true, depositAmount: true },
      }),
    ]);

    const unpaidBalance = unpaidOrders.reduce((sum: number, order: any) => {
      const total = Number(order?.totalAmount ?? 0);
      const deposit = Number(order?.depositAmount ?? 0);
      return sum + (Number.isFinite(total) ? total : 0) - (Number.isFinite(deposit) ? deposit : 0);
    }, 0);

    let lateOrders = 0;
    try {
      lateOrders = await (db as any).order.count({
        where: {
          dueDate: { lt: new Date() },
          status: { notIn: ["DONE", "CANCELLED"] },
        },
      });
    } catch {
      lateOrders = 0;
    }

    res.json({
      ordersToday,
      pendingTasks,
      unpaidBalance,
      lateOrders,
    });
  } catch (error) {
    console.error("[dashboard/summary] Failed", error);
    res.status(500).json({
      ordersToday: 0,
      pendingTasks: 0,
      unpaidBalance: 0,
      lateOrders: 0,
    });
  }
});

export default router;
