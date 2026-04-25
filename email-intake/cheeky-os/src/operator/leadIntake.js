"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Production status drift fixed: new lead tasks no longer enter PRODUCTION_READY pre-payment
// - Cash-protection rule applied: fail closed until verified deposit flow runs

const prisma = require("../prisma");
const scoreLead = require("./leadEngine");
const policyEngine = require("./policyEngine");
const actionAudit = require("./actionAudit");
const routingEngine = require("./routingEngine");
const pricingEngine = require("./pricingEngine");
const depositEngine = require("./depositEngine");

module.exports = async function leadIntake(input) {
  try {
    if (!prisma) {
      return {
        success: false,
        error: "Prisma unavailable",
      };
    }

    const payload = input && typeof input === "object" ? input : {};
    const qty = Number(payload.quantity || 0);
    const safeQty = Number.isFinite(qty) ? qty : 0;

    const leadScore = scoreLead(
      { name: payload.name, orderCount: payload.orderCount || 0 },
      { quantity: safeQty }
    );

    const quotePolicy = policyEngine({
      action: "GENERATE_QUOTE",
      data: { quantity: payload.quantity },
    });

    if (quotePolicy.blocked) {
      actionAudit({
        type: "QUOTE_BLOCKED",
        name: payload.name,
        quantity: payload.quantity,
        reasons: quotePolicy.reasons,
      });

      return {
        success: false,
        blocked: true,
        reasons: quotePolicy.reasons,
      };
    }

    const routing = routingEngine(payload);
    const pricing = pricingEngine(payload, routing);
    const deposit = depositEngine(pricing);

    const lead = await prisma.lead.create({
      data: {
        name: payload.name || null,
        email: payload.email || null,
        phone: payload.phone || null,
        message: payload.message || null,
        quantity: safeQty || null,
        score: leadScore.score,
        tier: leadScore.tier,
        quoteAmount: pricing.total,
        dealStatus: "NEW",
        depositRequired: deposit.depositRequired,
        depositAmount: deposit.depositAmount,
        depositPaid: false,
        paymentStatus: deposit.paymentStatus,
      },
    });

    actionAudit({
      type: "LEAD_CREATED",
      leadId: lead.id,
      name: lead.name,
      quantity: lead.quantity,
      score: lead.score,
      tier: lead.tier,
      quoteAmount: lead.quoteAmount,
    });

    try {
      const createdOrder = await prisma.order.create({
        data: {
          customerName: payload.name || "New Lead",
          email: payload.email || "lead@unknown.local",
          phone: payload.phone || null,
          notes: payload.message || "New lead inquiry",
          status: "INTAKE",
          quantity: safeQty || null,
        },
        select: { id: true },
      });

      const createdJob = await prisma.job.create({
        data: {
          orderId: createdOrder.id,
          status: "OPEN",
          notes: "Auto-created from lead intake",
        },
        select: { id: true },
      });

      await prisma.task.create({
        data: {
          jobId: createdJob.id,
          orderId: createdOrder.id,
          leadId: lead.id,
          title: `Review + follow up: ${payload.name || "New Lead"}`,
          type: "LEAD_FOLLOWUP",
          status: "INTAKE",
          assignedTo: "Patrick",
          notes: `Quote: $${pricing.total} | Deposit required: $${deposit.depositAmount} | ${payload.message || "New lead inquiry"}`,
          releaseStatus: "BLOCKED",
          orderReady: false,
          blanksOrdered: false,
          productionHold: true,
        },
      });
    } catch (e) {
      try {
        console.log("[leadIntake] follow-up task creation skipped:", e && e.message ? e.message : String(e));
      } catch (_) {}
    }

    return {
      success: true,
      lead,
      score: leadScore,
      routing,
      pricing,
      deposit,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : String(err),
    };
  }
};
