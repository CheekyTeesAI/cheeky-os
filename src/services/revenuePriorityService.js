"use strict";

const { getPrisma } = require("./decisionEngine");

function ageDays(when) {
  if (!when) return 0;
  const ts = new Date(when).getTime();
  if (!Number.isFinite(ts)) return 0;
  return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
}

function scoreOpportunity(row) {
  const amount = Number(row.amount || 0);
  const age = Number(row.ageDays || 0);
  const probability = Number(row.probability || 0);
  return amount * probability + age * 5;
}

async function getRevenueOpportunities(limit = 50) {
  const prisma = getPrisma();
  if (!prisma) {
    return { success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" };
  }
  try {
    const [orders, estimates] = await Promise.all([
      prisma.order.findMany({
        where: {
          OR: [{ status: "AWAITING_DEPOSIT" }, { blockedReason: "WAITING_ON_DEPOSIT" }],
        },
        select: {
          id: true,
          customerName: true,
          status: true,
          nextAction: true,
          nextOwner: true,
          amountPaid: true,
          quotedAmount: true,
          totalAmount: true,
          createdAt: true,
          updatedAt: true,
        },
        take: 400,
      }),
      prisma.estimate.findMany({
        where: { status: { in: ["DRAFT", "APPROVED"] } },
        select: {
          id: true,
          name: true,
          status: true,
          qty: true,
          createdAt: true,
          updatedAt: true,
          orderId: true,
        },
        take: 400,
      }),
    ]);

    const opportunities = [];
    for (const o of orders) {
      const amount = Math.max(Number(o.quotedAmount || o.totalAmount || 0), 0);
      const aDays = ageDays(o.updatedAt || o.createdAt);
      const probability = o.status === "AWAITING_DEPOSIT" ? 0.8 : 0.6;
      opportunities.push({
        type: "DEPOSIT_NEEDED",
        id: o.id,
        title: `${o.customerName || "Customer"} — deposit needed`,
        amount,
        ageDays: aDays,
        probability,
        nextAction: o.nextAction || "Collect deposit",
        nextOwner: o.nextOwner || "Cheeky",
      });
    }

    for (const e of estimates) {
      const unit = 9;
      const amount = Math.max(Number(e.qty || 0) * unit, 0);
      const aDays = ageDays(e.updatedAt || e.createdAt);
      const probability = e.status === "APPROVED" ? 0.85 : 0.45;
      opportunities.push({
        type: "UNAPPROVED_ESTIMATE",
        id: e.id,
        title: `${e.name || "Customer"} — estimate ${e.status}`,
        amount,
        ageDays: aDays,
        probability,
        nextAction: "Follow up estimate",
        nextOwner: "Cheeky",
      });
    }

    const sorted = opportunities
      .map((x) => ({ ...x, score: scoreOpportunity(x) }))
      .sort((a, b) => b.score - a.score || b.amount - a.amount || b.ageDays - a.ageDays)
      .slice(0, Math.max(1, limit));

    return {
      success: true,
      data: {
        opportunities: sorted,
      },
    };
  } catch (err) {
    console.error("[revenuePriorityService.getRevenueOpportunities]", err && err.stack ? err.stack : err);
    return { success: false, error: err && err.message ? err.message : "query_failed", code: "QUERY_FAILED" };
  }
}

module.exports = {
  getRevenueOpportunities,
};
