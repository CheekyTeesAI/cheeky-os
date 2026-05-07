"use strict";

const { getPrisma } = require("./decisionEngine");

async function scanSystem() {
  const prisma = getPrisma();
  if (!prisma) return [];

  const insights = [];

  const unpaid = await prisma.order.findMany({
    where: {
      squareInvoiceId: { not: null },
      depositPaid: false,
    },
    select: { id: true },
    take: 500,
  });
  if (unpaid.length > 0) {
    insights.push({
      type: "FOLLOWUPS",
      message: `${unpaid.length} unpaid orders need attention`,
    });
  }

  const production = await prisma.order.findMany({
    where: { productionComplete: false },
    take: 500,
  });
  if (production.length > 10) {
    insights.push({
      type: "PRODUCTION_LOAD",
      message: `High production load: ${production.length}`,
    });
  }

  const next = await prisma.order.findFirst({
    where: {
      garmentsReceived: true,
      productionComplete: false,
    },
    select: { customerName: true },
    orderBy: { createdAt: "asc" },
  });
  if (next) {
    insights.push({
      type: "NEXT_JOB",
      message: `Next job: ${next.customerName}`,
    });
  }

  return insights;
}

async function executeActions(insights) {
  if (String(process.env.AUTO_OPERATOR_MODE || "SAFE").toUpperCase() !== "ACTIVE") return;
  for (const i of insights || []) {
    if (i.type === "FOLLOWUPS") {
      console.log("[AUTO OPERATOR ACTIVE] Would trigger follow-ups");
    }
  }
}

async function runAutoOperator() {
  if (process.env.AUTO_OPERATOR_ENABLED !== "true") return [];
  try {
    const insights = await scanSystem();
    console.log("[AUTO OPERATOR]", (insights || []).map((i) => i.message));
    await executeActions(insights);
    return insights;
  } catch (e) {
    console.log("[AUTO OPERATOR ERROR]", e && e.message ? e.message : e);
    return [];
  }
}

module.exports = { runAutoOperator, scanSystem };
