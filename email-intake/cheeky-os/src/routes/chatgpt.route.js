"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const prisma = require("../prisma");
const { logChatGPTAudit } = require("../services/chatgptAudit");
const evaluateTaskReleaseAction = require("../actions/evaluateTaskReleaseAction");
const markBlanksOrderedAction = require("../actions/markBlanksOrderedAction");
const createVendorOrderDraftAction = require("../actions/createVendorOrderDraftAction");
const { getDecisionSnapshot } = require("../services/decisionSnapshot");
const { runDecisionEngine } = require("../services/decisionEngine");
const { executeDecisions } = require("../services/decisionExecutor");
const { getDecisionMode } = require("../services/decisionPolicy");
const { getCashSnapshot } = require("../services/cashSnapshot");
const { estimateRunwayDays } = require("../services/runwayEstimator");
const { getUpcomingObligations } = require("../services/obligationsTracker");
const { getCashPriorities } = require("../services/cashPressureEngine");
const { planFromRequest, approveBuildRequest, statusResponse } = require("../services/flowApi");

const capabilitiesService = require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "src",
  "services",
  "chatgptCapabilities"
));
const policy = require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "src",
  "services",
  "chatgptPolicy"
));
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
const chatgptAuth = require(path.join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "src",
  "services",
  "chatgptActionAuth"
));
const envValidation = require(path.join(__dirname, "..", "..", "..", "..", "src", "services", "envValidation"));

const router = express.Router();

const COMPATIBILITY_MAP = [
  { route: "/api/operator/readiness", classification: "READ_SAFE" },
  { route: "/api/system/status", classification: "READ_SAFE" },
  { route: "/api/operator/summary", classification: "READ_SAFE" },
  { route: "/api/operator/pipeline", classification: "READ_SAFE" },
  { route: "/api/operator/payments", classification: "READ_SAFE" },
  { route: "/api/operator/release", classification: "READ_SAFE" },
  { route: "/api/operator/vendor-drafts", classification: "READ_SAFE" },
  { route: "/api/operator/release/:id/evaluate", classification: "GUARDED_INTERNAL_ACTION" },
  { route: "/api/operator/release/:id/mark-blanks-ordered", classification: "GUARDED_INTERNAL_ACTION" },
  { route: "/api/operator/vendor-drafts/:id/create", classification: "DRAFT_SAFE" },
  { route: "/api/operator/payments/:id/mark-paid", classification: "BLOCKED_FOR_CHATGPT" },
];

function jsonError(res, route, err) {
  return res.json({
    success: false,
    route,
    error: err && err.message ? err.message : String(err),
    timestamp: new Date().toISOString(),
  });
}

async function buildReadinessResponse() {
  const envReadiness = envValidation.getEnvReadiness();
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || "").trim();
  const safeBaseUrl = publicBaseUrl || "http://localhost:3000";
  const notes = [].concat(envReadiness.blockedReasons || []);
  if (!publicBaseUrl) notes.push("PUBLIC_BASE_URL not set; operator preview may use SELFTEST_BASE_URL only");
  if (!envReadiness.chatgptActionApiKeyReady) {
    notes.push("CHATGPT_ACTION_API_KEY is missing or placeholder; protected /api/chatgpt/* routes return 401 until a strong secret is set");
  }
  if (!envReadiness.publicBaseUrlNonPlaceholder && publicBaseUrl) {
    notes.push("PUBLIC_BASE_URL appears to be a template; set the live https:// origin in deployment env");
  }
  return {
    success: true,
    chatgptIntegration: true,
    openapiReady: true,
    authReady: envReadiness.chatgptActionApiKeyReady,
    publicBaseUrl: safeBaseUrl,
    publicBaseUrlReady: envReadiness.publicBaseUrlReady,
    gptActionsEnvReady: envReadiness.chatgptActionApiKeyReady && envReadiness.publicBaseUrlReady,
    envReadiness: {
      chatgptActionApiKeyReady: envReadiness.chatgptActionApiKeyReady,
      publicBaseUrlReady: envReadiness.publicBaseUrlReady,
      blockedReasons: envReadiness.blockedReasons,
    },
    actionsBasePath: "/api/chatgpt",
    notes,
    timestamp: new Date().toISOString(),
  };
}

async function getSystemStatusSnapshot() {
  if (!prisma) {
    return {
      success: false,
      note: "Prisma unavailable",
      metrics: {},
      timestamp: new Date().toISOString(),
    };
  }
  const [ordersToday, depositsToday, productionCount] = await Promise.all([
    prisma.order.count({
      where: {
        createdAt: { gt: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.order.count({
      where: {
        depositPaidAt: { not: null },
        updatedAt: { gt: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.order.count({
      where: { status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] } },
    }),
  ]);
  return {
    success: true,
    metrics: {
      ordersToday,
      depositsToday,
      productionCount,
      systemStatus: "OK",
    },
    timestamp: new Date().toISOString(),
  };
}

router.get("/api/chatgpt/readiness", async (_req, res) => {
  try {
    const response = await buildReadinessResponse();
    return res.json(response);
  } catch (err) {
    return jsonError(res, "/api/chatgpt/readiness", err);
  }
});

router.get("/api/chatgpt/health", async (_req, res) => {
  try {
    return res.json({
      ok: true,
      service: "cheeky-chatgpt-actions",
      version: "1.0.0",
      authConfigured: chatgptAuth.isServerChatgptApiKeyConfigValid(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/health", err);
  }
});

router.get("/api/chatgpt/launch-check", async (req, res) => {
  try {
    console.log("[ROUTE ACTIVE] /api/chatgpt/launch-check hit", req && req.method ? req.method : "");
    const er = envValidation.getEnvReadiness();
    const port = String(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000);
    const loopback = `http://127.0.0.1:${port}`;
    const publicUrl = String(process.env.PUBLIC_BASE_URL || "").trim() || loopback;
    const docsReadiness = path.join(__dirname, "..", "..", "..", "..", "docs", "chatgpt-action-readiness.json");
    let lastVerdict = null;
    let smoketestVerdict = null;
    try {
      if (fs.existsSync(docsReadiness)) {
        const j = JSON.parse(fs.readFileSync(docsReadiness, "utf8"));
        lastVerdict = j && j.overallVerdict ? j.overallVerdict : null;
      }
      const smPath = path.join(__dirname, "..", "..", "..", "..", "docs", "chatgpt-live-smoketest.json");
      if (fs.existsSync(smPath)) {
        const sm = JSON.parse(fs.readFileSync(smPath, "utf8"));
        smoketestVerdict = sm && sm.verdict ? sm.verdict : null;
      }
    } catch (_) {}

    let healthOk = false;
    let protectedProbe = "SKIP";
    try {
      const hr = await fetch(`${loopback}/api/chatgpt/health`);
      healthOk = hr.ok;
      if (er.chatgptActionApiKeyReady) {
        const key = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
        const pr = await fetch(`${loopback}/api/chatgpt/capabilities`, { headers: { "x-api-key": key } });
        protectedProbe = pr.ok ? "OK" : `HTTP_${pr.status}`;
      } else {
        protectedProbe = "NOT_READY_KEY";
      }
    } catch (probeErr) {
      protectedProbe = `ERR:${probeErr && probeErr.message ? probeErr.message : "fetch_failed"}`;
    }

    const testsLine =
      smoketestVerdict === "PASS" && lastVerdict === "READY"
        ? "PASS"
        : smoketestVerdict || lastVerdict
          ? `${smoketestVerdict || "?"}/${lastVerdict || "?"}`
          : "NOT_RUN";

    const envReady = er.blockedReasons.length === 0;
    const liveReady =
      envReady && healthOk && er.chatgptActionApiKeyReady && protectedProbe === "OK" && lastVerdict === "READY" && smoketestVerdict === "PASS";
    const testsOut = liveReady ? "PASS" : testsLine;

    return res.json({
      ready: Boolean(liveReady),
      auth: er.chatgptActionApiKeyReady ? "OK" : "NOT_READY",
      baseUrl: publicUrl,
      tests: testsOut,
      smoketestVerdict: smoketestVerdict || "UNKNOWN",
      lastReportVerdict: lastVerdict || "UNKNOWN",
      status: liveReady ? "LIVE" : "NOT_LIVE",
      message: liveReady
        ? "Cheeky OS is fully connected and ready for ChatGPT operator control"
        : envReady
          ? "Env valid; run npm run chatgpt:launch-validate and ensure lastReportVerdict is READY with smoketest PASS"
          : (er.blockedReasons && er.blockedReasons[0]) || "See envReadiness.blockedReasons",
      envReadiness: er,
      healthProbe: healthOk ? "OK" : "FAIL",
      protectedProbe,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      ready: false,
      auth: "UNKNOWN",
      baseUrl: String(process.env.PUBLIC_BASE_URL || "").trim() || null,
      tests: "ERROR",
      status: "NOT_LIVE",
      message: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/api/chatgpt/capabilities", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    return res.json({
      success: true,
      capabilities: capabilitiesService.getChatGPTCapabilities(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/capabilities", err);
  }
});

router.get("/api/chatgpt/system-status", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    return res.json(await getSystemStatusSnapshot());
  } catch (err) {
    return jsonError(res, "/api/chatgpt/system-status", err);
  }
});

router.get("/api/chatgpt/operator-summary", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    if (!prisma) {
      return res.json(normalizer.normalizeOperatorSummary({}));
    }
    const [payments, pipelineLeads, pipelineTasks, releaseTasks, vendorDrafts, readiness, systemStatus] =
      await Promise.all([
        prisma.lead.count({ where: { depositRequired: true, depositPaid: false } }),
        prisma.lead.count(),
        prisma.task.count({ where: { status: { not: "COMPLETED" } } }),
        prisma.task.findMany({ select: { releaseStatus: true }, take: 100 }),
        prisma.vendorOrderDraft && prisma.vendorOrderDraft.count ? prisma.vendorOrderDraft.count() : 0,
        buildReadinessResponse(),
        getSystemStatusSnapshot(),
      ]);
    return res.json(
      normalizer.normalizeOperatorSummary({
        readiness,
        systemStatus,
        paymentCount: payments,
        pipelineLeadCount: pipelineLeads,
        pipelineTaskCount: pipelineTasks,
        releaseCount: releaseTasks.length,
        releaseReadyCount: releaseTasks.filter((r) => r.releaseStatus === "READY").length,
        vendorDraftCount: Number(vendorDrafts || 0),
      })
    );
  } catch (err) {
    return jsonError(res, "/api/chatgpt/operator-summary", err);
  }
});

router.get("/api/chatgpt/payments", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    if (!prisma) return res.json(normalizer.normalizePayments({ success: false }));
    const leadsNeedingDeposit = await prisma.lead.findMany({
      where: { depositRequired: true, depositPaid: false },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    return res.json(normalizer.normalizePayments({ success: true, leadsNeedingDeposit }));
  } catch (err) {
    return jsonError(res, "/api/chatgpt/payments", err);
  }
});

router.get("/api/chatgpt/pipeline", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    if (!prisma) return res.json(normalizer.normalizePipeline({ success: false }));
    const [leads, tasks] = await Promise.all([
      prisma.lead.findMany({ take: 25, orderBy: { createdAt: "desc" } }),
      prisma.task.findMany({ where: { status: { not: "COMPLETED" } }, take: 25 }),
    ]);
    return res.json(normalizer.normalizePipeline({ success: true, leads, tasks }));
  } catch (err) {
    return jsonError(res, "/api/chatgpt/pipeline", err);
  }
});

router.get("/api/chatgpt/release-queue", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    if (!prisma) return res.json(normalizer.normalizeReleaseQueue({ success: false }));
    const tasks = await prisma.task.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    return res.json(
      normalizer.normalizeReleaseQueue({
        success: true,
        tasks: tasks.map((t) => ({
          ...t,
          eligibleForVendorDraft: t.releaseStatus === "READY" && t.orderReady === true && !t.blanksOrdered,
        })),
      })
    );
  } catch (err) {
    return jsonError(res, "/api/chatgpt/release-queue", err);
  }
});

router.get("/api/chatgpt/vendor-drafts", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    let drafts = [];
    if (prisma && prisma.vendorOrderDraft && typeof prisma.vendorOrderDraft.findMany === "function") {
      drafts = await prisma.vendorOrderDraft.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }
    return res.json(normalizer.normalizeVendorDrafts({ success: true, drafts }));
  } catch (err) {
    return jsonError(res, "/api/chatgpt/vendor-drafts", err);
  }
});

router.get("/api/chatgpt/decisions", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    return res.json(await getDecisionSnapshot());
  } catch (err) {
    return jsonError(res, "/api/chatgpt/decisions", err);
  }
});

router.get("/api/chatgpt/decisions/top", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    const snapshot = await getDecisionSnapshot();
    return res.json({
      mode: snapshot.mode,
      totalRecommendations: snapshot.totalRecommendations,
      topActions: (snapshot.topActions || []).slice(0, 5),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/decisions/top", err);
  }
});

router.get("/api/chatgpt/cash/snapshot", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    return res.json({ success: true, snapshot: await getCashSnapshot(), timestamp: new Date().toISOString() });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/cash/snapshot", err);
  }
});

router.get("/api/chatgpt/cash/runway", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    const snapshot = await getCashSnapshot();
    const obligations = getUpcomingObligations();
    const runway = estimateRunwayDays(snapshot, obligations);
    return res.json({ success: true, runway, timestamp: new Date().toISOString() });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/cash/runway", err);
  }
});

router.get("/api/chatgpt/cash/priorities", chatgptAuth.requireChatGPTActionAuth, async (_req, res) => {
  try {
    const priorities = await getCashPriorities();
    return res.json({ success: true, priorities, count: priorities.length, timestamp: new Date().toISOString() });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/cash/priorities", err);
  }
});

router.get("/api/chatgpt/route-audit", async (_req, res) => {
  try {
    return res.json({
      success: true,
      compatibilityMap: COMPATIBILITY_MAP,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/route-audit", err);
  }
});

router.post("/api/chatgpt/actions/create-internal-task", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  const actionName = "create-internal-task";
  try {
    const decision = policy.canExecuteChatGPTAction(actionName, req.body);
    if (!decision.allowed) {
      const audit = await logChatGPTAudit({
        route: req.path,
        action: actionName,
        payloadSummary: req.body,
        outcome: "blocked",
        blockedReason: decision.reason,
      });
      return res.json({
        success: false,
        performedAction: actionName,
        blockedReason: decision.reason,
        auditId: audit.auditId,
        timestamp: new Date().toISOString(),
      });
    }
    if (!prisma) throw new Error("Prisma unavailable");
    const payload = req.body || {};
    const entityType = String(payload.entityType || "");
    const entityId = String(payload.entityId || "");
    const taskType = String(payload.taskType || "CHATGPT_INTERNAL_REVIEW");
    let orderId = null;
    let jobId = null;
    if (entityType === "order") {
      orderId = entityId;
      const job = await prisma.job.findFirst({ where: { orderId }, select: { id: true } });
      jobId = job && job.id ? job.id : null;
    } else if (entityType === "lead") {
      const lead = await prisma.lead.findUnique({ where: { id: entityId } });
      orderId = lead && lead.orderId ? lead.orderId : null;
      if (orderId) {
        const job = await prisma.job.findFirst({ where: { orderId }, select: { id: true } });
        jobId = job && job.id ? job.id : null;
      }
    }
    if (!jobId) {
      const audit = await logChatGPTAudit({
        route: req.path,
        action: actionName,
        payloadSummary: { entityType, entityId, taskType },
        outcome: "blocked",
        blockedReason: "missing_job_link",
      });
      return res.json({
        success: false,
        performedAction: actionName,
        blockedReason: "missing_job_link",
        auditId: audit.auditId,
        timestamp: new Date().toISOString(),
      });
    }
    const created = await prisma.task.create({
      data: {
        jobId,
        orderId,
        title: `CHATGPT: ${taskType}`,
        type: taskType,
        status: "INTAKE",
        assignedTo: "Patrick",
        notes: String(payload.note || "Created by ChatGPT action bridge"),
      },
    });
    const audit = await logChatGPTAudit({
      route: req.path,
      action: actionName,
      payloadSummary: { entityType, entityId, taskType, priority: payload.priority || null },
      outcome: "success",
    });
    return res.json({
      success: true,
      performedAction: actionName,
      taskId: created.id,
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/actions/create-internal-task", err);
  }
});

router.post("/api/chatgpt/actions/evaluate-release", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  const actionName = "evaluate-release";
  try {
    const decision = policy.canExecuteChatGPTAction(actionName, req.body);
    if (!decision.allowed) {
      const audit = await logChatGPTAudit({
        route: req.path,
        action: actionName,
        payloadSummary: req.body,
        outcome: "blocked",
        blockedReason: decision.reason,
      });
      return res.json({
        success: false,
        performedAction: actionName,
        blockedReason: decision.reason,
        auditId: audit.auditId,
        timestamp: new Date().toISOString(),
      });
    }
    const taskId = req.body && req.body.taskId ? String(req.body.taskId) : "";
    const result = await evaluateTaskReleaseAction(taskId);
    const audit = await logChatGPTAudit({
      route: req.path,
      action: actionName,
      payloadSummary: { taskId },
      outcome: result && result.success ? "success" : "blocked",
      blockedReason: result && result.success ? null : result.message || result.error || "evaluate_failed",
    });
    return res.json({
      success: Boolean(result && result.success),
      performedAction: actionName,
      result,
      blockedReason: result && result.success ? null : result.message || result.error || "evaluate_failed",
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/actions/evaluate-release", err);
  }
});

router.post("/api/chatgpt/actions/mark-blanks-ordered", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  const actionName = "mark-blanks-ordered";
  try {
    const decision = policy.canExecuteChatGPTAction(actionName, req.body);
    if (!decision.allowed) {
      const audit = await logChatGPTAudit({
        route: req.path,
        action: actionName,
        payloadSummary: req.body,
        outcome: "blocked",
        blockedReason: decision.reason,
      });
      return res.json({
        success: false,
        performedAction: actionName,
        blockedReason: decision.reason,
        auditId: audit.auditId,
        timestamp: new Date().toISOString(),
      });
    }
    const taskId = req.body && req.body.taskId ? String(req.body.taskId) : "";
    const result = await markBlanksOrderedAction(taskId);
    const audit = await logChatGPTAudit({
      route: req.path,
      action: actionName,
      payloadSummary: { taskId },
      outcome: result && result.success ? "success" : "blocked",
      blockedReason: result && result.success ? null : result.message || result.error || "mark_failed",
    });
    return res.json({
      success: Boolean(result && result.success),
      performedAction: actionName,
      result,
      blockedReason: result && result.success ? null : result.message || result.error || "mark_failed",
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/actions/mark-blanks-ordered", err);
  }
});

router.post("/api/chatgpt/actions/create-vendor-draft", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  const actionName = "create-vendor-draft";
  try {
    const decision = policy.canExecuteChatGPTAction(actionName, req.body);
    if (!decision.allowed) {
      const audit = await logChatGPTAudit({
        route: req.path,
        action: actionName,
        payloadSummary: req.body,
        outcome: "blocked",
        blockedReason: decision.reason,
      });
      return res.json({
        success: false,
        performedAction: actionName,
        blockedReason: decision.reason,
        auditId: audit.auditId,
        timestamp: new Date().toISOString(),
      });
    }
    const taskId = req.body && req.body.taskId ? String(req.body.taskId) : "";
    const result = await createVendorOrderDraftAction(taskId);
    const audit = await logChatGPTAudit({
      route: req.path,
      action: actionName,
      payloadSummary: { taskId },
      outcome: result && result.success ? "success" : "blocked",
      blockedReason: result && result.success ? null : result.message || result.error || "draft_failed",
    });
    return res.json({
      success: Boolean(result && result.success),
      performedAction: actionName,
      result,
      blockedReason: result && result.success ? null : result.message || result.error || "draft_failed",
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/actions/create-vendor-draft", err);
  }
});

async function createDraftRequest(actionName, payload, reqPath) {
  const decision = policy.canExecuteChatGPTAction(actionName, payload);
  if (!decision.allowed) {
    const audit = await logChatGPTAudit({
      route: reqPath,
      action: actionName,
      payloadSummary: payload,
      outcome: "blocked",
      blockedReason: decision.reason,
    });
    return {
      success: false,
      performedAction: actionName,
      blockedReason: decision.reason,
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    };
  }
  if (!prisma || !prisma.notification || typeof prisma.notification.create !== "function") {
    const audit = await logChatGPTAudit({
      route: reqPath,
      action: actionName,
      payloadSummary: payload,
      outcome: "blocked",
      blockedReason: "no_safe_draft_wrapper",
    });
    return {
      success: false,
      performedAction: actionName,
      blockedReason: "no_safe_draft_wrapper",
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    };
  }
  const item = await prisma.notification.create({
    data: {
      type: actionName.toUpperCase(),
      entityId: payload && payload.orderId ? String(payload.orderId) : null,
      customerName: payload && payload.customerName ? String(payload.customerName) : null,
      messageText: JSON.stringify({
        source: "chatgpt",
        action: actionName,
        payload,
        mode: "draft_request",
      }),
      status: "READY",
    },
  });
  const audit = await logChatGPTAudit({
    route: reqPath,
    action: actionName,
    payloadSummary: payload,
    outcome: "success",
  });
  return {
    success: true,
    performedAction: actionName,
    requestId: item.id,
    auditId: audit.auditId,
    timestamp: new Date().toISOString(),
  };
}

router.post("/api/chatgpt/actions/create-draft-estimate-request", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  try {
    return res.json(
      await createDraftRequest("create-draft-estimate-request", req.body || {}, req.path)
    );
  } catch (err) {
    return jsonError(res, "/api/chatgpt/actions/create-draft-estimate-request", err);
  }
});

router.post("/api/chatgpt/actions/create-draft-invoice-request", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  try {
    return res.json(
      await createDraftRequest("create-draft-invoice-request", req.body || {}, req.path)
    );
  } catch (err) {
    return jsonError(res, "/api/chatgpt/actions/create-draft-invoice-request", err);
  }
});

router.post("/api/chatgpt/flow/plan", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  try {
    const out = planFromRequest(req.body || {});
    if (out.executable) {
      return res.json({
        success: true,
        executable: true,
        reason: out.reason,
        buildRequired: false,
        nextStep: "execute",
        timestamp: new Date().toISOString(),
      });
    }
    return res.json({
      success: true,
      executable: false,
      buildRequired: true,
      reason: out.reason,
      missing: out.missing,
      intent: out.intent,
      manifest: out.manifest,
      flow: out.flow,
      buildPrompt: out.buildPrompt,
      buildId: out.buildId,
      nextStep: out.nextStep,
      message: "This capability does not exist yet. I can build it (manifest + Cursor prompt; no auto-execution).",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/flow/plan", err);
  }
});

router.post("/api/chatgpt/flow/approve-build", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  try {
    const r = approveBuildRequest(req.body || {});
    if (!r.success) {
      return res.json({ success: false, error: r.error, timestamp: new Date().toISOString() });
    }
    return res.json({
      success: true,
      build: r.build,
      buildPrompt: r.buildPrompt,
      nextStep: r.nextStep,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/flow/approve-build", err);
  }
});

router.get("/api/chatgpt/flow/status/:id", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  try {
    const r = statusResponse(String(req.params.id || ""));
    if (!r.success) {
      return res.json({ success: false, error: r.error, timestamp: new Date().toISOString() });
    }
    return res.json({ success: true, ...r, timestamp: new Date().toISOString() });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/flow/status", err);
  }
});

router.post("/api/chatgpt/actions/run-decision-engine", chatgptAuth.requireChatGPTActionAuth, async (req, res) => {
  const actionName = "run-decision-engine";
  try {
    const generated = await runDecisionEngine();
    const decisions = (generated && generated.decisions) || [];
    let finalDecisions = decisions;
    if (getDecisionMode() === "controlled_internal_actions") {
      finalDecisions = await executeDecisions(decisions);
    }
    const audit = await logChatGPTAudit({
      route: req.path,
      action: actionName,
      payloadSummary: req.body || {},
      outcome: "success",
    });
    return res.json({
      success: true,
      performedAction: actionName,
      mode: getDecisionMode(),
      generated: decisions.length,
      executed: finalDecisions.filter((d) => d.outcome === "executed").length,
      blocked: finalDecisions.filter((d) => d.outcome === "blocked").length,
      topActions: finalDecisions.slice(0, 5),
      auditId: audit.auditId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(res, "/api/chatgpt/actions/run-decision-engine", err);
  }
});

module.exports = router;
