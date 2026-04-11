import { db } from "../db/client";
import {
  calculateOrderPriority,
  type PriorityLevel,
} from "./priorityService";

const AWAITING_DEPOSIT_STATUSES = [
  "QUOTE_READY",
  "APPROVED",
  "INVOICE_DRAFTED",
] as const;

function sumQuoted(
  rows: Array<{ quotedAmount: number | null | undefined }>
): number {
  return rows.reduce((s, r) => s + (r.quotedAmount ?? 0), 0);
}

export async function getTodayDashboard(): Promise<{
  success: true;
  exceptions: {
    openCount: number;
    highPriorityCount: number;
    bySeverity: Record<string, number>;
    recent: Array<{
      id: string;
      orderId: string | null;
      jobId: string | null;
      type: string;
      source: string;
      severity: string;
      message: string;
      createdAt: Date;
    }>;
  };
  overrides: {
    count7d: number;
    recent: Array<{
      orderId: string;
      overriddenBy: string | null;
      reason: string | null;
      timestamp: Date | null;
    }>;
  };
  dashboard: {
    summary: {
      awaitingDepositCount: number;
      blockedOrdersCount: number;
      productionReadyJobsCount: number;
      openTasksCount: number;
      paidInFullOrdersCount: number;
      totalAwaitingDepositRevenue: number;
      totalBlockedRevenue: number;
      totalProductionReadyRevenue: number;
    };
    awaitingDeposit: Array<{
      id: string;
      customerName: string;
      quotedAmount: number | null;
      depositRequired: number | null;
      squareInvoiceNumber: string | null;
      createdAt: Date;
      status: string;
    }>;
    blockedOrders: Array<{
      id: string;
      customerName: string;
      blockedReason: string | null;
      quotedAmount: number | null;
      margin: number | null;
      pph: number | null;
      createdAt: Date;
    }>;
    productionReadyJobs: Array<{
      id: string;
      orderId: string;
      customerName: string;
      productionType: string | null;
      notes: string | null;
      createdAt: Date;
    }>;
    openTasks: Array<{
      id: string;
      title: string;
      type: string;
      status: string;
      assignedTo: string | null;
      jobId: string;
      createdAt: Date;
    }>;
    paidInFullOrders: Array<{
      id: string;
      customerName: string;
      quotedAmount: number | null;
      amountPaid: number;
      finalPaidAt: Date | null;
    }>;
  };
  priority: {
    summary: Record<PriorityLevel, number>;
    topCritical: Array<{
      orderId: string;
      customerName: string;
      status: string;
      priorityScore: number;
      priorityLevel: "critical";
    }>;
  };
}> {
  try {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    awaitingDeposit,
    blockedOrders,
    productionReadyJobsRows,
    openTasks,
    paidInFullOrders,
    openExceptionsRecent,
    exceptionOpenCount,
    exceptionHighCount,
    exceptionBySeverity,
    overrideCount7d,
    overrideRecent,
    priorityOrdersSample,
  ] = await Promise.all([
    db.order.findMany({
      where: { status: { in: [...AWAITING_DEPOSIT_STATUSES] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        customerName: true,
        quotedAmount: true,
        depositRequired: true,
        squareInvoiceNumber: true,
        createdAt: true,
        status: true,
      },
    }),
    db.order.findMany({
      where: { status: "BLOCKED" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        customerName: true,
        blockedReason: true,
        quotedAmount: true,
        margin: true,
        pph: true,
        createdAt: true,
      },
    }),
    db.job.findMany({
      where: {
        status: "PRODUCTION_READY",
        order: { status: "PRODUCTION_READY" },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        orderId: true,
        productionType: true,
        notes: true,
        createdAt: true,
        order: {
          select: {
            customerName: true,
            quotedAmount: true,
          },
        },
      },
    }),
    db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        assignedTo: true,
        jobId: true,
        createdAt: true,
      },
    }),
    db.order.findMany({
      where: { status: "PAID_IN_FULL" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        customerName: true,
        quotedAmount: true,
        amountPaid: true,
        finalPaidAt: true,
      },
    }),
    db.exceptionReview.findMany({
      where: { resolved: false },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        orderId: true,
        jobId: true,
        type: true,
        source: true,
        severity: true,
        message: true,
        createdAt: true,
      },
    }),
    db.exceptionReview.count({ where: { resolved: false } }),
    db.exceptionReview.count({
      where: {
        resolved: false,
        OR: [
          { severity: { equals: "HIGH", mode: "insensitive" } },
          { severity: { equals: "CRITICAL", mode: "insensitive" } },
        ],
      },
    }),
    db.exceptionReview.groupBy({
      by: ["severity"],
      where: { resolved: false },
      _count: { _all: true },
    }),
    db.order.count({
      where: {
        manualOverride: true,
        manualOverrideAt: { gte: sevenDaysAgo },
      },
    }),
    db.order.findMany({
      where: {
        manualOverride: true,
        manualOverrideAt: { gte: sevenDaysAgo },
      },
      orderBy: { manualOverrideAt: "desc" },
      take: 10,
      select: {
        id: true,
        manualOverrideBy: true,
        manualOverrideReason: true,
        manualOverrideAt: true,
      },
    }),
    db.order.findMany({
      where: { status: { not: "PAID_IN_FULL" } },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        customerName: true,
        status: true,
        quotedAmount: true,
        total: true,
        invoiceExpiresAt: true,
        quoteExpiresAt: true,
        isRush: true,
        blockedReason: true,
      },
    }),
  ]);

  const productionReadyJobs = productionReadyJobsRows.map((j) => ({
    id: j.id,
    orderId: j.orderId,
    customerName: j.order.customerName,
    productionType: j.productionType,
    notes: j.notes,
    createdAt: j.createdAt,
  }));

  const totalProductionReadyRevenue = productionReadyJobsRows.reduce(
    (s, j) => s + (j.order.quotedAmount ?? 0),
    0
  );

  const bySeverity: Record<string, number> = {};
  for (const row of exceptionBySeverity) {
    bySeverity[row.severity] = row._count._all;
  }

  const prioritySummary: Record<PriorityLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };
  const scored = priorityOrdersSample.map((o) => {
    const { priorityScore, priorityLevel } = calculateOrderPriority({
      dueDate: o.invoiceExpiresAt ?? o.quoteExpiresAt,
      total: o.total,
      quotedAmount: o.quotedAmount,
      status: o.status,
      isRush: o.isRush,
      blockedReason: o.blockedReason,
    });
    prioritySummary[priorityLevel] += 1;
    return {
      orderId: o.id,
      customerName: o.customerName,
      status: o.status,
      priorityScore,
      priorityLevel,
    };
  });
  const topCritical = scored
    .filter((r): r is (typeof r) & { priorityLevel: "critical" } =>
      r.priorityLevel === "critical"
    )
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5)
    .map((r) => ({
      orderId: r.orderId,
      customerName: r.customerName,
      status: r.status,
      priorityScore: r.priorityScore,
      priorityLevel: r.priorityLevel,
    }));

  return {
    success: true,
    exceptions: {
      openCount: exceptionOpenCount,
      highPriorityCount: exceptionHighCount,
      bySeverity,
      recent: openExceptionsRecent,
    },
    overrides: {
      count7d: overrideCount7d,
      recent: overrideRecent.map((o) => ({
        orderId: o.id,
        overriddenBy: o.manualOverrideBy ?? null,
        reason: o.manualOverrideReason ?? null,
        timestamp: o.manualOverrideAt ?? null,
      })),
    },
    dashboard: {
      summary: {
        awaitingDepositCount: awaitingDeposit.length,
        blockedOrdersCount: blockedOrders.length,
        productionReadyJobsCount: productionReadyJobs.length,
        openTasksCount: openTasks.length,
        paidInFullOrdersCount: paidInFullOrders.length,
        totalAwaitingDepositRevenue: sumQuoted(awaitingDeposit),
        totalBlockedRevenue: sumQuoted(blockedOrders),
        totalProductionReadyRevenue,
      },
      awaitingDeposit,
      blockedOrders,
      productionReadyJobs,
      openTasks,
      paidInFullOrders,
    },
    priority: {
      summary: prioritySummary,
      topCritical,
    },
  };
  } catch (err) {
    console.error(
      "[dashboardService] getTodayDashboard failed; returning empty snapshot.",
      err instanceof Error ? err.message : err
    );
    return {
      success: true,
      exceptions: {
        openCount: 0,
        highPriorityCount: 0,
        bySeverity: {},
        recent: [],
      },
      overrides: { count7d: 0, recent: [] },
      dashboard: {
        summary: {
          awaitingDepositCount: 0,
          blockedOrdersCount: 0,
          productionReadyJobsCount: 0,
          openTasksCount: 0,
          paidInFullOrdersCount: 0,
          totalAwaitingDepositRevenue: 0,
          totalBlockedRevenue: 0,
          totalProductionReadyRevenue: 0,
        },
        awaitingDeposit: [],
        blockedOrders: [],
        productionReadyJobs: [],
        openTasks: [],
        paidInFullOrders: [],
      },
      priority: {
        summary: { low: 0, medium: 0, high: 0, critical: 0 },
        topCritical: [],
      },
    };
  }
}
