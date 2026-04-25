"use strict";

module.exports = async function execute(command) {
  if (!command) {
    return { success: false, message: "No command provided" };
  }

  const lower = String(command).toLowerCase();

  try {
    if (lower.includes("price") || lower.includes("quote")) {
      const routingEngine = require("../operator/routingEngine");
      const pricingEngine = require("../operator/pricingEngine");

      const qtyMatch = String(command).match(/\d+/);
      const qty = qtyMatch ? parseInt(qtyMatch[0], 10) : 0;

      const routing = routingEngine({ quantity: qty });
      const pricing = pricingEngine({ quantity: qty }, routing);

      return {
        success: true,
        routing,
        pricing,
        message: `Quote: $${pricing.total} using ${routing.method}`,
      };
    }

    // SEND FOLLOW-UP EMAIL
    if (lower.includes("send follow up")) {
      const sendEmail = require("../actions/sendEmailAction");

      // VERY BASIC PARSING (upgrade later)
      const emailMatch = String(command).match(/\S+@\S+\.\S+/);
      const email = emailMatch ? emailMatch[0] : null;

      const message = String(command).split("message:")[1] || "Hey! Just checking in.";

      return await sendEmail({
        to: email,
        subject: "Following up",
        message: String(message).trim(),
      });
    }

    // INVOICE
    if (lower.includes("invoice")) {
      const action = require("../actions/invoiceAction");
      return await action(command);
    }

    // ORDER STATUS (fallback intent; avoid stealing specialized commands)
    if (
      (lower.includes("status") || lower.includes("order")) &&
      !lower.includes("payment status") &&
      !lower.includes("release status") &&
      !lower.includes("mark blanks ordered") &&
      !lower.includes("create draft order") &&
      !lower.includes("show draft orders")
    ) {
      const action = require("../actions/orderStatusAction");
      return await action(command);
    }

    // SUMMARY / DASHBOARD
    if (
      lower.includes("summary") ||
      lower.includes("dashboard") ||
      lower.includes("what is going on") ||
      lower.includes("status of business")
    ) {
      const action = require("../actions/summaryAction");
      return await action();
    }

    // PRINTING PRIORITIES
    if (
      lower.includes("what needs printing") ||
      lower.includes("printing today") ||
      lower.includes("print queue")
    ) {
      const getSummary = require("../operator/summary");
      const data = await getSummary();

      return {
        success: true,
        message: "Here is what needs printing",
        printingQueue: (data && data.queues && data.queues.printing) || [],
        productionReady: (data && data.queues && data.queues.productionReady) || [],
        alerts: (data && data.alerts) || [],
      };
    }

    // PROBLEM DETECTION
    if (
      lower.includes("what is behind") ||
      lower.includes("what is overdue") ||
      lower.includes("problems")
    ) {
      const getSummary = require("../operator/summary");
      const data = await getSummary();

      return {
        success: true,
        message: "Here are current issues",
        alerts: (data && data.alerts) || [],
      };
    }

    // WHAT SHOULD WE DO
    if (
      lower.includes("what should i do") ||
      lower.includes("priority") ||
      lower.includes("what next")
    ) {
      const getSummary = require("../operator/summary");
      const data = await getSummary();

      return {
        success: true,
        message: "Here is what you should focus on",
        priorities: (data && data.priorities) || [],
      };
    }

    // ADVANCE TASK
    if (lower.includes("advance task")) {
      const taskAdvance = require("../actions/taskAdvanceAction");

      const taskIdMatch = String(command).match(/[a-z0-9][a-z0-9-]{9,}/i);
      const taskId = taskIdMatch ? taskIdMatch[0] : null;

      return await taskAdvance(taskId);
    }

    // ASSIGN TASK
    if (lower.includes("assign task")) {
      const assignTask = require("../actions/assignTaskAction");

      const taskIdMatch = String(command).match(/[a-z0-9][a-z0-9-]{9,}/i);
      const taskId = taskIdMatch ? taskIdMatch[0] : null;

      return await assignTask(taskId, "Jeremy");
    }

    if (lower.includes("close deal")) {
      const updateDeal = require("../actions/updateDealStatus");

      const idMatch = String(command).match(/[a-z0-9][a-z0-9-]{2,}/i);
      const id = idMatch ? idMatch[0] : null;

      return await updateDeal(id, "WON");
    }

    if (
      lower.includes("pipeline") ||
      lower.includes("new leads") ||
      lower.includes("what came in")
    ) {
      const prisma = require("../prisma");

      if (!prisma) {
        return {
          success: false,
          message: "Prisma unavailable",
          leads: [],
        };
      }

      const leads = await prisma.lead.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      return {
        success: true,
        message: "Here are your latest leads",
        leads,
      };
    }

    if (
      lower.includes("unpaid deposits") ||
      lower.includes("show unpaid deposits") ||
      lower.includes("who owes deposit")
    ) {
      const prisma = require("../prisma");

      if (!prisma) {
        return {
          success: false,
          message: "Prisma unavailable",
          leads: [],
        };
      }

      const leads = await prisma.lead.findMany({
        where: {
          depositRequired: true,
          depositPaid: false,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      return {
        success: true,
        message: "Here are the leads with unpaid deposits",
        leads,
      };
    }

    if (lower.includes("mark deposit paid")) {
      const markDepositPaidAction = require("../actions/markDepositPaidAction");
      const idMatch = String(command).match(/[a-z0-9][a-z0-9-]{9,}/i);
      const leadId = idMatch ? idMatch[0] : null;

      return await markDepositPaidAction(leadId);
    }

    if (
      lower.includes("payment status") ||
      lower.includes("show payments") ||
      lower.includes("who has paid")
    ) {
      const prisma = require("../prisma");
      if (!prisma) {
        return {
          success: false,
          message: "Prisma unavailable",
          leads: [],
        };
      }

      const leads = await prisma.lead.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      return {
        success: true,
        message: "Here is the latest payment status view",
        leads: leads.map((l) => ({
          id: l.id,
          name: l.name,
          quoteAmount: l.quoteAmount,
          depositAmount: l.depositAmount,
          depositPaid: l.depositPaid,
          paymentStatus: l.paymentStatus,
        })),
      };
    }

    if (
      lower.includes("release status") ||
      lower.includes("show release queue") ||
      lower.includes("what is blocked")
    ) {
      const prisma = require("../prisma");
      if (!prisma) {
        return {
          success: false,
          message: "Prisma unavailable",
          tasks: [],
        };
      }

      const tasks = await prisma.task.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      return {
        success: true,
        message: "Here is the release queue",
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          releaseStatus: t.releaseStatus,
          orderReady: t.orderReady,
          blanksOrdered: t.blanksOrdered,
          productionHold: t.productionHold,
        })),
      };
    }

    if (lower.includes("evaluate release")) {
      const evaluateTaskReleaseAction = require("../actions/evaluateTaskReleaseAction");
      const idMatch = String(command).match(/[a-z0-9][a-z0-9-]{9,}/i);
      const taskId = idMatch ? idMatch[0] : null;
      return await evaluateTaskReleaseAction(taskId);
    }

    if (lower.includes("mark blanks ordered")) {
      const markBlanksOrderedAction = require("../actions/markBlanksOrderedAction");
      const idMatch = String(command).match(/[a-z0-9][a-z0-9-]{9,}/i);
      const taskId = idMatch ? idMatch[0] : null;
      return await markBlanksOrderedAction(taskId);
    }

    if (
      lower.includes("vendor drafts") ||
      lower.includes("show vendor drafts") ||
      lower.includes("show draft orders")
    ) {
      const prisma = require("../prisma");
      let drafts = [];
      try {
        if (prisma && prisma.vendorOrderDraft && typeof prisma.vendorOrderDraft.findMany === "function") {
          drafts = await prisma.vendorOrderDraft.findMany({
            orderBy: { createdAt: "desc" },
            take: 10,
          });
        }
      } catch (_) {}

      return {
        success: true,
        message: "Here are the latest vendor drafts",
        drafts,
      };
    }

    if (
      lower.includes("create vendor draft") ||
      lower.includes("create draft order")
    ) {
      const createVendorOrderDraftAction = require("../actions/createVendorOrderDraftAction");
      const idMatch = String(command).match(/[a-z0-9][a-z0-9-]{9,}/i);
      const taskId = idMatch ? idMatch[0] : null;
      return await createVendorOrderDraftAction(taskId);
    }

    // APPROVAL LIST
    if (lower.includes("show approvals") || lower.includes("pending approvals")) {
      const approvalEngine = require("../operator/approvalEngine");
      return approvalEngine.list();
    }

    // APPROVE ACTION
    if (lower.includes("approve ")) {
      const approvalEngine = require("../operator/approvalEngine");
      const idMatch = String(command).match(/apr_[a-zA-Z0-9_\\-]+/);
      const approvalId = idMatch ? idMatch[0] : null;
      return approvalEngine.approve(approvalId);
    }

    // REJECT ACTION
    if (lower.includes("reject ")) {
      const approvalEngine = require("../operator/approvalEngine");
      const idMatch = String(command).match(/apr_[a-zA-Z0-9_\\-]+/);
      const approvalId = idMatch ? idMatch[0] : null;
      return approvalEngine.reject(approvalId);
    }

    if (
      lower.includes("best leads") ||
      lower.includes("top customers") ||
      lower.includes("who matters")
    ) {
      const salesEngine = require("../operator/salesEngine");
      const data = await salesEngine();

      return {
        success: true,
        message: "Here are your highest value opportunities",
        actions: (data && data.actions) || [],
      };
    }

    // MONEY STATUS
    if (
      lower.includes("how much money") ||
      lower.includes("daily target") ||
      lower.includes("revenue today")
    ) {
      const getSummary = require("../operator/summary");
      const data = await getSummary();

      return {
        success: true,
        message: (((data || {}).money || {}).message) || "",
        money: ((data || {}).money) || {},
      };
    }

    // SALES / MONEY
    if (
      lower.includes("sales") ||
      lower.includes("money") ||
      lower.includes("who should i follow up") ||
      lower.includes("follow up") ||
      lower.includes("revenue")
    ) {
      const salesEngine = require("../operator/salesEngine");
      const data = await salesEngine();

      return {
        success: true,
        message: "Here are your follow-ups",
        actions: (((data && data.actions) || [])).map((a) => ({
          message: a.message,
          suggestedMessage: a.suggestedMessage,
        })),
      };
    }

    return {
      success: false,
      message: "Unknown command",
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
