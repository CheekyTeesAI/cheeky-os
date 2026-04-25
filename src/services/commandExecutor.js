"use strict";

const crypto = require("crypto");
const { getPrisma } = require("./decisionEngine");
const { buildFollowups } = require("./followupService");
const { autoScheduleJobs } = require("./schedulerService");
const { getInsights } = require("./insightService");
const { getDealList } = require("./dealCloserService");

function quickEmail(name) {
  const h = crypto
    .createHash("sha256")
    .update(String(name || "walk-in"))
    .digest("hex")
    .slice(0, 18);
  return `cmd-${h}@cheeky-intake.local`;
}

async function executeCommand(cmd) {
  try {
    const prisma = getPrisma();
    if (!prisma) return { message: "Database unavailable" };

    if (cmd.action === "CREATE_ORDER") {
      const customerName = String(cmd.payload && cmd.payload.customerName ? cmd.payload.customerName : "Walk-in");
      const qty = Number(cmd.payload && cmd.payload.quantity ? cmd.payload.quantity : 1) || 1;
      const product = String(cmd.payload && cmd.payload.product ? cmd.payload.product : "T-Shirts");

      const order = await prisma.order.create({
        data: {
          customerName,
          email: quickEmail(customerName),
          phone: "",
          quantity: qty,
          notes: product,
          status: "INTAKE",
        },
      });

      return {
        message: `Order created for ${order.customerName}`,
        orderId: order.id,
      };
    }

    if (cmd.action === "GET_PRODUCTION_QUEUE") {
      const orders = await prisma.order.findMany({
        where: { productionComplete: false },
        take: 200,
      });
      return { message: `You have ${orders.length} jobs in production` };
    }

    if (cmd.action === "RUN_FOLLOWUPS") {
      const list = await buildFollowups();
      return { message: `${list.length} follow-ups ready` };
    }

    if (cmd.action === "GET_NEXT_JOB") {
      const job = await prisma.order.findFirst({
        where: {
          garmentsReceived: true,
          productionComplete: false,
        },
        orderBy: { createdAt: "asc" },
      });

      if (!job) return { message: "No jobs ready" };
      return { message: `Next job: ${job.customerName}` };
    }

    if (cmd.action === "RUN_SCHEDULE") {
      await autoScheduleJobs();
      return { message: "Schedule updated" };
    }

    if (cmd.action === "GET_INSIGHTS") {
      const insights = await getInsights();
      return {
        message: (insights || []).map((i) => i.message).join(", ") || "No insights right now",
      };
    }

    if (cmd.action === "GET_DEALS") {
      const deals = await getDealList();
      return {
        message: `${(deals || []).length} deals pending`,
      };
    }

    return { message: "Command not recognized" };
  } catch (e) {
    return { message: `Error: ${e && e.message ? e.message : "command_failed"}` };
  }
}

module.exports = { executeCommand };
