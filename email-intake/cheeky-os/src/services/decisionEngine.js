"use strict";

const prisma = require("../prisma");
const { logDecision } = require("./decisionAudit");
const { getCashPriorities } = require("./cashPressureEngine");
const { getCashMode } = require("./cashPolicy");

const DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 72 * 60 * 60 * 1000;
const PRINTING_STALE_MS = 18 * 60 * 60 * 1000;

function makeDecision(base) {
  return {
    id: `${base.decisionType}:${base.entityId}:${Date.now()}:${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    ...base,
  };
}

function evaluateOrderDecisions(order) {
  const decisions = [];
  if (!order) return decisions;
  const ageMs = Date.now() - new Date(order.createdAt || Date.now()).getTime();
  const updatedAgeMs = Date.now() - new Date(order.updatedAt || Date.now()).getTime();
  const hasDeposit = Boolean(order.depositPaidAt);

  if ((order.status === "QUOTE_SENT" || order.status === "ATTENTION_REQUIRED") && !hasDeposit && ageMs > DAY_MS) {
    decisions.push(
      makeDecision({
        entityType: "order",
        entityId: order.id,
        decisionType: "payment_followup_review",
        recommendedAction: "create_internal_task",
        priority: ageMs > THREE_DAYS_MS ? "critical" : "high",
        confidence: ageMs > THREE_DAYS_MS ? 0.95 : 0.86,
        outcome: "recommended",
        reason:
          ageMs > THREE_DAYS_MS
            ? "Deposit outstanding for over 72h; urgent attention required."
            : "Deposit outstanding for over 24h; follow-up review recommended.",
        data: { status: order.status, ageHours: Math.floor(ageMs / (60 * 60 * 1000)) },
      })
    );
  }

  if (order.status === "DEPOSIT_PAID" && order.garmentsOrdered !== true) {
    decisions.push(
      makeDecision({
        entityType: "order",
        entityId: order.id,
        decisionType: "garment_order_review",
        recommendedAction: "create_internal_task",
        priority: "high",
        confidence: 0.85,
        outcome: "recommended",
        reason: "Deposit is paid and garments are not ordered; garment review is next-best action.",
        data: { garmentsOrdered: Boolean(order.garmentsOrdered) },
      })
    );
  }

  if (order.status === "PRODUCTION_READY" && updatedAgeMs > DAY_MS) {
    decisions.push(
      makeDecision({
        entityType: "order",
        entityId: order.id,
        decisionType: "production_review",
        recommendedAction: "create_internal_task",
        priority: "high",
        confidence: 0.8,
        outcome: "recommended",
        reason: "Order has been production-ready for over 24h and needs production review.",
        data: { staleHours: Math.floor(updatedAgeMs / (60 * 60 * 1000)) },
      })
    );
  }

  if (order.status === "PRINTING" && updatedAgeMs > PRINTING_STALE_MS) {
    decisions.push(
      makeDecision({
        entityType: "order",
        entityId: order.id,
        decisionType: "print_bottleneck_review",
        recommendedAction: "create_internal_task",
        priority: "high",
        confidence: 0.78,
        outcome: "recommended",
        reason: "Order appears stale in PRINTING and should be reviewed for bottlenecks.",
        data: { staleHours: Math.floor(updatedAgeMs / (60 * 60 * 1000)) },
      })
    );
  }

  if (!hasDeposit && (order.status === "PRODUCTION_READY" || order.status === "PRINTING")) {
    decisions.push(
      makeDecision({
        entityType: "order",
        entityId: order.id,
        decisionType: "block_unsafe_production_advance",
        recommendedAction: "block_only",
        priority: "critical",
        confidence: 0.98,
        outcome: "blocked",
        reason: "Order is missing depositPaidAt; production advancement must remain blocked.",
        data: { status: order.status },
      })
    );
  }

  return decisions;
}

function evaluateProductionDecisions(context) {
  const decisions = [];
  const tasks = Array.isArray(context && context.releaseTasks) ? context.releaseTasks : [];
  tasks.forEach((task) => {
    if (task.releaseStatus !== "READY") {
      decisions.push(
        makeDecision({
          entityType: "task",
          entityId: task.id,
          decisionType: "release_evaluation_needed",
          recommendedAction: "evaluate_release",
          priority: "high",
          confidence: 0.84,
          outcome: "recommended",
          reason: "Release queue item is pending review and should be evaluated.",
          data: { releaseStatus: task.releaseStatus, orderReady: task.orderReady },
        })
      );
    }
  });
  return decisions;
}

function evaluatePaymentDecisions(context) {
  const decisions = [];
  const unpaidLeadCount = Number((context && context.unpaidLeadCount) || 0);
  if (unpaidLeadCount > 0) {
    decisions.push(
      makeDecision({
        entityType: "system",
        entityId: "payments",
        decisionType: "payment_attention_queue",
        recommendedAction: "create_internal_task",
        priority: unpaidLeadCount > 8 ? "critical" : "high",
        confidence: 0.82,
        outcome: "recommended",
        reason: `${unpaidLeadCount} leads require deposit attention.`,
        data: { unpaidLeadCount },
      })
    );
  }
  return decisions;
}

function rankDecisions(decisions) {
  const pri = { critical: 4, high: 3, medium: 2, low: 1 };
  return [...(decisions || [])].sort((a, b) => {
    const aCash = String(a.entityType || "").toLowerCase() === "cash";
    const bCash = String(b.entityType || "").toLowerCase() === "cash";
    if (aCash !== bCash) return bCash ? 1 : -1;
    const p = (pri[b.priority] || 0) - (pri[a.priority] || 0);
    if (p !== 0) return p;
    return (b.confidence || 0) - (a.confidence || 0);
  });
}

function mapCashPriorityToDecision(priority) {
  return makeDecision({
    entityType: "cash",
    entityId: priority.entityId || priority.id,
    decisionType: `cash_${priority.id}`,
    recommendedAction: priority.recommendedAction || "flag_runway_risk",
    priority: priority.priority || "medium",
    confidence: priority.certainty === "actual" ? 0.9 : 0.76,
    outcome: "recommended",
    reason: priority.reason || priority.title || "Cash priority surfaced",
    data: {
      category: priority.category,
      expectedImpact: priority.expectedImpact,
      cashMode: getCashMode(),
    },
  });
}

async function runDecisionEngine() {
  if (!prisma) {
    return { success: false, decisions: [], reason: "prisma_unavailable" };
  }
  try {
    const [orders, releaseTasks, unpaidLeadCount, activeTasks] = await Promise.all([
      prisma.order.findMany({
        take: 200,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          depositPaidAt: true,
          garmentsOrdered: true,
        },
      }),
      prisma.task.findMany({
        take: 100,
        where: { status: { not: "COMPLETED" } },
        select: { id: true, orderId: true, releaseStatus: true, orderReady: true, status: true, updatedAt: true },
      }),
      prisma.lead.count({ where: { depositRequired: true, depositPaid: false } }),
      prisma.task.findMany({
        take: 200,
        where: { status: { not: "COMPLETED" } },
        select: { id: true, orderId: true, type: true },
      }),
    ]);

    const decisions = [];
    orders.forEach((order) => decisions.push(...evaluateOrderDecisions(order)));
    decisions.push(...evaluateProductionDecisions({ releaseTasks }));
    decisions.push(...evaluatePaymentDecisions({ unpaidLeadCount }));
    const cashPriorities = await getCashPriorities();
    cashPriorities.slice(0, 10).forEach((p) => decisions.push(mapCashPriorityToDecision(p)));

    const taskCoverage = new Set(activeTasks.filter((t) => t.orderId).map((t) => `${t.orderId}:${t.type || ""}`));
    orders.forEach((order) => {
      const isCriticalPayment = (order.status === "QUOTE_SENT" || order.status === "ATTENTION_REQUIRED") && !order.depositPaidAt;
      if (isCriticalPayment && !taskCoverage.has(`${order.id}:DEPOSIT_REVIEW`)) {
        decisions.push(
          makeDecision({
            entityType: "order",
            entityId: order.id,
            decisionType: "missing_task_coverage",
            recommendedAction: "create_internal_task",
            priority: "high",
            confidence: 0.75,
            outcome: "recommended",
            reason: "Critical payment-risk order has no active deposit review task.",
            data: { status: order.status },
          })
        );
      }
    });

    const ranked = rankDecisions(decisions);
    for (const d of ranked) {
      await logDecision(d);
    }
    return { success: true, decisions: ranked };
  } catch (err) {
    return { success: false, decisions: [], reason: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  runDecisionEngine,
  evaluateOrderDecisions,
  evaluateProductionDecisions,
  evaluatePaymentDecisions,
  rankDecisions,
};
