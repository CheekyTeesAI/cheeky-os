"use strict";

const path = require("path");
const prisma = require("../prisma");
const evaluateTaskReleaseAction = require("../actions/evaluateTaskReleaseAction");
const createVendorOrderDraftAction = require("../actions/createVendorOrderDraftAction");
const { getDecisionSnapshot } = require("./decisionSnapshot");
const { runDecisionEngine } = require("./decisionEngine");
const { executeDecisions } = require("./decisionExecutor");
const { getDecisionMode } = require("./decisionPolicy");
const { getCashSnapshot } = require("./cashSnapshot");
const { estimateRunwayDays } = require("./runwayEstimator");
const { getCashPriorities } = require("./cashPressureEngine");
const { getUpcomingObligations } = require("./obligationsTracker");
const { canRunMobileCommand } = require("./mobileCommandPolicy");
const { logMobileCommand } = require("./mobileCommandAudit");
const { canExecuteIntent, isPlannableUnimplementedIntent } = require("./capabilityDetector");
const { generateProcessManifest } = require("./processManifestor");
const { buildFlowFromManifest } = require("./flowBuilder");
const { generateCursorBuildPrompt } = require("./buildPromptGenerator");
const { createBuildRecord } = require("./buildTracker");

const normalizer = require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "src",
  "services",
  "chatgptNormalizer"
));

async function observedResponse(intent, message, data, confidence, auditId) {
  return {
    success: true,
    mode: "mobile_operator",
    intent,
    confidence,
    outcome: "observed",
    message,
    data: data || {},
    auditId: auditId || null,
    timestamp: new Date().toISOString(),
  };
}

async function executeMobileCommand(parsed, context) {
  const intent = String(parsed.intent || "unknown");
  const confidence = Number(parsed.confidence || 0);
  const extracted = parsed.extracted || {};
  const rawInput = String(context && context.rawInput ? context.rawInput : "");
  const channel = String(context && context.source ? context.source : "mobile_text");

  if (confidence >= 0.6 && intent !== "unknown" && isPlannableUnimplementedIntent(intent)) {
    const cap = canExecuteIntent(intent);
    if (!cap.executable) {
      const mctx = { rawText: rawInput, source: channel };
      const manifest = generateProcessManifest(intent, mctx);
      const fl = buildFlowFromManifest(manifest);
      const buildPrompt = generateCursorBuildPrompt(manifest, fl);
      const rec = createBuildRecord(manifest);
      const audit = await logMobileCommand({
        channel,
        rawInput,
        parsedIntent: intent,
        confidence,
        outcome: "build_required",
        payloadSummary: { buildId: rec.id, intent },
      });
      return {
        success: true,
        mode: "mobile_operator",
        intent,
        confidence,
        outcome: "build_required",
        message: "This capability does not exist yet. I can build it.",
        data: { manifest, flow: fl, buildPrompt, buildId: rec.id, nextStep: "approve_build" },
        auditId: audit.auditId,
        timestamp: new Date().toISOString(),
      };
    }
  }

  const policy = canRunMobileCommand(intent, extracted);
  if (!policy.allowed) {
    const audit = await logMobileCommand({
      channel,
      rawInput,
      parsedIntent: intent,
      confidence,
      outcome: "blocked",
      payloadSummary: extracted,
      blockedReason: policy.reason,
    });
    return {
      success: false,
      mode: "mobile_operator",
      intent,
      confidence,
      outcome: "blocked",
      message: "That action is blocked in mobile operator mode.",
      reason: policy.reason,
      data: {},
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    };
  }

  if (confidence < 0.6 || intent === "unknown") {
    const audit = await logMobileCommand({
      channel,
      rawInput,
      parsedIntent: intent,
      confidence,
      outcome: "clarification_needed",
      payloadSummary: extracted,
      blockedReason: "low_confidence_or_unknown_intent",
    });
    return {
      success: false,
      mode: "mobile_operator",
      intent,
      confidence,
      outcome: "clarification_needed",
      message: "I need a clearer command to do that safely.",
      data: {},
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    if (!prisma) throw new Error("Prisma unavailable");

    if (intent === "get_system_status") {
      const [ordersToday, depositsToday, productionCount] = await Promise.all([
        prisma.order.count({ where: { createdAt: { gt: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
        prisma.order.count({ where: { depositPaidAt: { not: null } } }),
        prisma.order.count({ where: { status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] } } }),
      ]);
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { ordersToday, depositsToday, productionCount },
      });
      return observedResponse(intent, "System status loaded.", { ordersToday, depositsToday, productionCount }, confidence, audit.auditId);
    }

    if (intent === "get_operator_summary") {
      const [payments, leads, tasks, readyReleases] = await Promise.all([
        prisma.lead.count({ where: { depositRequired: true, depositPaid: false } }),
        prisma.lead.count(),
        prisma.task.count({ where: { status: { not: "COMPLETED" } } }),
        prisma.task.count({ where: { releaseStatus: "READY" } }),
      ]);
      const data = { paymentsNeedingAttention: payments, leadCount: leads, activeTaskCount: tasks, readyReleaseCount: readyReleases };
      const audit = await logMobileCommand({ channel, rawInput, parsedIntent: intent, confidence, outcome: "observed", payloadSummary: data });
      return observedResponse(intent, "Operator summary loaded.", data, confidence, audit.auditId);
    }

    if (intent === "get_unpaid_deposits") {
      const leadsNeedingDeposit = await prisma.lead.findMany({
        where: { depositRequired: true, depositPaid: false },
        take: 20,
        orderBy: { createdAt: "desc" },
      });
      const normalized = normalizer.normalizePayments({ success: true, leadsNeedingDeposit });
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { count: normalized.count },
      });
      return observedResponse(intent, `Found ${normalized.count} unpaid deposits.`, normalized, confidence, audit.auditId);
    }

    if (intent === "get_stuck_production" || intent === "get_release_queue") {
      const tasks = await prisma.task.findMany({
        where: intent === "get_stuck_production" ? { status: "PRODUCTION_READY", releaseStatus: { not: "READY" } } : {},
        take: 25,
        orderBy: { createdAt: "desc" },
      });
      const normalized = normalizer.normalizeReleaseQueue({ success: true, tasks });
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { count: normalized.count, blockedCount: normalized.blockedCount },
      });
      const msg = intent === "get_stuck_production" ? `Found ${normalized.blockedCount} stuck production tasks.` : `Release queue has ${normalized.count} tasks.`;
      return observedResponse(intent, msg, normalized, confidence, audit.auditId);
    }

    if (intent === "get_vendor_drafts") {
      let drafts = [];
      if (prisma.vendorOrderDraft && typeof prisma.vendorOrderDraft.findMany === "function") {
        drafts = await prisma.vendorOrderDraft.findMany({ orderBy: { createdAt: "desc" }, take: 25 });
      }
      const normalized = normalizer.normalizeVendorDrafts({ success: true, drafts });
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { count: normalized.count },
      });
      return observedResponse(intent, `Found ${normalized.count} vendor drafts.`, normalized, confidence, audit.auditId);
    }

    if (intent === "get_top_priorities") {
      const snap = await getDecisionSnapshot();
      const data = {
        mode: snap.mode,
        totalRecommendations: snap.totalRecommendations,
        topActions: (snap.topActions || []).slice(0, 5),
      };
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { totalRecommendations: data.totalRecommendations },
      });
      return observedResponse(intent, "Top priorities loaded.", data, confidence, audit.auditId);
    }

    if (intent === "get_cash_snapshot") {
      const snapshot = await getCashSnapshot();
      const compact = {
        paidToday: snapshot.inflows.paidToday,
        unpaidDeposits: snapshot.inflows.unpaidDeposits,
        knownObligationsNext7Days: snapshot.outflows.knownObligationsNext7Days,
        liquidity: snapshot.liquidity,
        dataQuality: snapshot.dataQuality,
      };
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { dataQuality: snapshot.dataQuality.score },
      });
      return observedResponse(intent, "Cash snapshot loaded.", compact, confidence, audit.auditId);
    }

    if (intent === "get_runway") {
      const snapshot = await getCashSnapshot();
      const obligations = getUpcomingObligations();
      const runway = estimateRunwayDays(snapshot, obligations);
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { runwayDays: runway.runwayDays, certainty: runway.certainty },
      });
      return observedResponse(intent, "Runway estimate loaded.", runway, confidence, audit.auditId);
    }

    if (intent === "get_cash_attention") {
      const priorities = await getCashPriorities();
      const data = { count: priorities.length, top: priorities.slice(0, 5) };
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { count: priorities.length },
      });
      return observedResponse(intent, "Cash priorities loaded.", data, confidence, audit.auditId);
    }

    if (intent === "get_obligations_due_soon") {
      const dueSoon = getUpcomingObligations()
        .filter((o) => o.daysUntilDue !== null && o.daysUntilDue <= 14 && o.daysUntilDue >= 0)
        .sort((a, b) => (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999));
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "observed",
        payloadSummary: { count: dueSoon.length },
      });
      return observedResponse(intent, "Upcoming obligations loaded.", { count: dueSoon.length, obligations: dueSoon }, confidence, audit.auditId);
    }

    if (intent === "create_internal_task") {
      const orderId = extracted.orderId;
      if (!orderId) {
        const audit = await logMobileCommand({
          channel, rawInput, parsedIntent: intent, confidence, outcome: "clarification_needed",
          payloadSummary: extracted, blockedReason: "missing_order_id",
        });
        return {
          success: false, mode: "mobile_operator", intent, confidence,
          outcome: "clarification_needed",
          message: "I need an order ID to create that task safely.",
          data: {}, auditId: audit.auditId, timestamp: new Date().toISOString(),
        };
      }
      const job = await prisma.job.findFirst({ where: { orderId }, select: { id: true } });
      if (!job || !job.id) {
        const audit = await logMobileCommand({
          channel, rawInput, parsedIntent: intent, confidence, outcome: "blocked",
          payloadSummary: { orderId }, blockedReason: "missing_job_link",
        });
        return {
          success: false, mode: "mobile_operator", intent, confidence,
          outcome: "blocked", message: "That action is blocked in mobile operator mode.",
          reason: "missing_job_link", data: {}, auditId: audit.auditId,
          timestamp: new Date().toISOString(),
        };
      }
      const task = await prisma.task.create({
        data: {
          jobId: job.id,
          orderId,
          title: `MOBILE REVIEW: ${extracted.note || "Review requested"}`,
          type: "MOBILE_INTERNAL_TASK",
          status: "INTAKE",
          assignedTo: "Patrick",
          notes: extracted.note || "Mobile operator request",
        },
      });
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "executed",
        payloadSummary: { orderId, taskId: task.id, priority: extracted.priority || "MEDIUM" },
      });
      return {
        success: true, mode: "mobile_operator", intent, confidence, outcome: "executed",
        message: `Internal task ${task.id} created.`,
        data: { taskId: task.id, orderId }, auditId: audit.auditId,
        timestamp: new Date().toISOString(),
      };
    }

    if (intent === "evaluate_release") {
      const taskId = extracted.taskId;
      if (!taskId) {
        const audit = await logMobileCommand({
          channel, rawInput, parsedIntent: intent, confidence, outcome: "clarification_needed",
          payloadSummary: extracted, blockedReason: "missing_task_id",
        });
        return {
          success: false, mode: "mobile_operator", intent, confidence,
          outcome: "clarification_needed",
          message: "I need a task ID to do that safely.",
          data: {}, auditId: audit.auditId, timestamp: new Date().toISOString(),
        };
      }
      const result = await evaluateTaskReleaseAction(taskId);
      const ok = Boolean(result && result.success);
      const outcome = ok ? "executed" : "blocked";
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome,
        payloadSummary: { taskId }, blockedReason: ok ? null : (result.message || result.error || "evaluate_failed"),
      });
      return {
        success: ok, mode: "mobile_operator", intent, confidence, outcome,
        message: ok ? "Release evaluation completed." : "That action is blocked in mobile operator mode.",
        data: result || {}, reason: ok ? null : (result.message || result.error || "evaluate_failed"),
        auditId: audit.auditId, timestamp: new Date().toISOString(),
      };
    }

    if (intent === "create_vendor_draft") {
      const taskId = extracted.taskId;
      if (!taskId) {
        const audit = await logMobileCommand({
          channel, rawInput, parsedIntent: intent, confidence, outcome: "clarification_needed",
          payloadSummary: extracted, blockedReason: "missing_task_id",
        });
        return {
          success: false, mode: "mobile_operator", intent, confidence,
          outcome: "clarification_needed",
          message: "I need a task ID to do that safely.",
          data: {}, auditId: audit.auditId, timestamp: new Date().toISOString(),
        };
      }
      const result = await createVendorOrderDraftAction(taskId);
      const ok = Boolean(result && result.success);
      const outcome = ok ? "drafted" : "blocked";
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome,
        payloadSummary: { taskId }, blockedReason: ok ? null : (result.message || result.error || "draft_failed"),
      });
      return {
        success: ok, mode: "mobile_operator", intent, confidence, outcome,
        message: ok ? "Vendor draft created." : "That action is blocked in mobile operator mode.",
        data: result || {}, reason: ok ? null : (result.message || result.error || "draft_failed"),
        auditId: audit.auditId, timestamp: new Date().toISOString(),
      };
    }

    if (intent === "run_decision_engine") {
      const generated = await runDecisionEngine();
      const decisions = (generated && generated.decisions) || [];
      let finalDecisions = decisions;
      if (getDecisionMode() === "controlled_internal_actions") {
        finalDecisions = await executeDecisions(decisions);
      }
      const executed = finalDecisions.filter((d) => d.outcome === "executed").length;
      const blocked = finalDecisions.filter((d) => d.outcome === "blocked").length;
      const audit = await logMobileCommand({
        channel, rawInput, parsedIntent: intent, confidence, outcome: "executed",
        payloadSummary: { generated: decisions.length, executed, blocked },
      });
      return {
        success: true, mode: "mobile_operator", intent, confidence, outcome: "executed",
        message: "Decision engine run completed.",
        data: {
          mode: getDecisionMode(),
          generated: decisions.length,
          executed,
          blocked,
          topActions: finalDecisions.slice(0, 5),
        },
        auditId: audit.auditId, timestamp: new Date().toISOString(),
      };
    }

    const audit = await logMobileCommand({
      channel, rawInput, parsedIntent: intent, confidence, outcome: "blocked",
      payloadSummary: extracted, blockedReason: "unsupported_intent",
    });
    return {
      success: false, mode: "mobile_operator", intent, confidence,
      outcome: "blocked", message: "That action is blocked in mobile operator mode.",
      reason: "unsupported_intent", data: {}, auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const audit = await logMobileCommand({
      channel, rawInput, parsedIntent: intent, confidence, outcome: "blocked",
      payloadSummary: extracted, blockedReason: err && err.message ? err.message : String(err),
    });
    return {
      success: false,
      mode: "mobile_operator",
      intent,
      confidence,
      outcome: "blocked",
      message: "That action is blocked in mobile operator mode.",
      reason: err && err.message ? err.message : String(err),
      data: {},
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = {
  executeMobileCommand,
};
