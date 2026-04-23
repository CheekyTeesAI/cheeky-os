/**
 * Cheeky OS — production HTTP server (Express).
 *
 * Entry points:
 * - Hosts (e.g. Render): repo root `render-http.js` → requires this file.
 * - Direct: `node cheeky-os/server.js` with cwd `email-intake`.
 * - Dev API (separate): `npm run dev` → `src/api/voice.run.ts` (not this file).
 *
 * Port: `PORT` (cloud) or `CHEEKY_OS_PORT` or default 3000. Bind: 0.0.0.0.
 */

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Verified entrypoints: render-http.js -> cheeky-os/server.js and npm start -> cheeky-os/server.js
// - Verified canonical Square raw webhook mount before express.json()
// - Added launch hardening: uncaught handlers, agent scheduler, /api/system/status route

require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const path = require("path");

try {
  const envValidation = require(path.join(__dirname, "..", "..", "src", "services", "envValidation"));
  const k = String(process.env.CHATGPT_ACTION_API_KEY || "").trim();
  const u = String(process.env.PUBLIC_BASE_URL || "").trim();
  console.log(`[ENV] CHATGPT_ACTION_API_KEY length: ${k.length} (set: ${k.length > 0})`);
  console.log(`[ENV] PUBLIC_BASE_URL: ${u || "(unset)"}`);
  const er = envValidation.getEnvReadiness();
  if (er.blockedReasons && er.blockedReasons.length) {
    console.log(`[ENV] GPT Actions env: NOT_READY | ${er.blockedReasons.join(" | ")}`);
  } else {
    console.log("[ENV] GPT Actions env: validation OK (non-placeholder key + https public URL)");
  }
} catch (envLogErr) {
  console.log("[ENV] env validation log skipped:", envLogErr && envLogErr.message ? envLogErr.message : String(envLogErr));
}

const {
  logReadinessLines,
  warnStrictEnv,
} = require("./config/env");
const { generateCursorPrompt } = require("./src/ai/chadCodeGenerator");
const { applyPatch } = require("./src/ai/chadApply");
const { getLatestTask, readTask } = require("./src/ai/chadExecutor");
const { startAutomation } = require("./src/services/automationRunner");
const { startAgentScheduler } = require("./src/services/agentScheduler");
const fs = require("fs");

const express = require("express");
const { initializeSquareIntegration } = require("./integrations/square");
const cheekyRouter = require("./routes");
const revenueRouter = require("./routes/revenue");
const mobileDashboardRouter = require("./routes/mobileDashboard");
const dashboardNextRouter = require("./routes/dashboardNext");
const dashboardRouter = require("./routes/dashboard");
const squareDraftRouter = require("./routes/squareDraft");
const salesRouter = require("./routes/sales");
const captureRouter = require("./routes/capture");
const ordersCaptureRouter = require("./routes/ordersCapture");
const ordersStatusRouter = require("./routes/ordersStatus");
const ordersMemoryRouter = require("./routes/ordersMemory");
const ordersIntelligenceRouter = require("./routes/ordersIntelligence");
const productionRouter = require("./routes/production");
const alertsRouter = require("./routes/alerts");
const opsTodayRouter = require("./routes/opsToday");
const founderTodayRouter = require("./routes/founderToday");
const automationRouter = require("./routes/automation");
const summaryTodayRouter = require("./routes/summaryToday");
const copilotTodayRouter = require("./routes/copilotToday");
const systemCheckRouter = require("./routes/systemCheck");
const depositFollowupsRouter = require("./routes/depositFollowups");
const garmentOperatorListRouter = require("./routes/garmentOperatorList");
const garmentOrderMarkRouter = require("./routes/garmentOrderMark");
const notificationsRouter = require("./routes/notifications");
const appCenterRouter = require("./routes/appCenter");
const runbookRouter = require("./routes/runbook");
const autopilotRouter = require("./routes/autopilot");
const pricingRouter = require("./routes/pricing");
const { router: responsesRouter } = require("./routes/responses");
const { router: cashRouter } = require("./routes/cash");
const cashBlitzRouter = require("./routes/cashBlitz");
const { router: exceptionsRouter } = require("./routes/exceptions");
const { router: ledgerRouter } = require("./routes/ledger");
const { router: scorecardRouter } = require("./routes/scorecard");
const { router: goalsRouter } = require("./routes/goals");
const { router: nextActionsRouter } = require("./routes/nextActions");
const autoExecutionRouter = require("./routes/autoExecution");
const reactivationRouter = require("./routes/reactivation");
const leadsRouter = require("./routes/leads");
const retargetingRouter = require("./routes/retargeting");
const memoryRouter = require("./routes/memory");
const taskAdvanceRouter = require("./routes/taskAdvance");
const adsAnalyzeRouter = require("./routes/adsAnalyze");
const kaizenRouter = require("./routes/kaizen");
const artRouter = require("./routes/art");
const proofsRouter = require("./routes/proofs");
const commsRouter = require("./routes/comms");
const orderFilesRouter = require("./routes/orderFiles");
const workOrdersRouter = require("./routes/workOrders");
const quotesRouter = require("./routes/quotes");
const aiExecuteRouter = require("./routes/aiExecute");
const aiContextRouter = require("./routes/aiContext");
const autopilotApiRouter = require("./routes/autopilotApi");
const reportsRouter = require("./routes/reports");
const commandsRouter = require("./routes/commands");
const phoneIncomingRouter = require("./routes/phoneIncoming");
const cheekiAiRouter = require(path.join(__dirname, "..", "..", "src", "routes", "cheekiAi"));
const collectionsRouter = require(path.join(__dirname, "..", "..", "src", "routes", "collections"));
const emailIntakeManualRouter = require(path.join(__dirname, "..", "..", "src", "routes", "emailIntake"));
const { getSystemHealthReport } = require(path.join(__dirname, "..", "..", "src", "services", "systemEngine"));
const briefingRouter = require(path.join(__dirname, "..", "..", "src", "routes", "briefing"));
const { generateDailyBriefing } = require(path.join(__dirname, "..", "..", "src", "services", "briefingService"));
const dataSquareRouter = require(path.join(__dirname, "..", "..", "src", "routes", "dataSquare"));
const queryRouter = require(path.join(__dirname, "..", "..", "src", "routes", "query"));
const jobsRouter = require(path.join(__dirname, "..", "..", "src", "routes", "jobs"));
const webhooksEmailRouter = require(path.join(__dirname, "..", "..", "src", "routes", "webhooksEmail"));
const cheekyDashboardRouter = require(path.join(__dirname, "..", "..", "src", "routes", "cheekyDashboard"));
const productionQueueRouter = require(path.join(__dirname, "..", "..", "src", "routes", "production"));
const purchasingRouter = require(path.join(__dirname, "..", "..", "src", "routes", "purchasing"));
const routingDecisionsRouter = require(path.join(__dirname, "..", "..", "src", "routes", "routing"));
const financeSummaryRouter = require(path.join(__dirname, "..", "..", "src", "routes", "finance"));
const commandRouterExpress = require(path.join(__dirname, "..", "..", "src", "routes", "command"));
const aiCommandRouterV57 = require(path.join(__dirname, "..", "..", "src", "routes", "ai.command"));
const aiStatusRouterV58 = require(path.join(__dirname, "..", "..", "src", "routes", "ai.status"));
const cashflowRouterV59 = require(path.join(__dirname, "..", "..", "src", "routes", "cashflow"));
const dealsRouterV60 = require(path.join(__dirname, "..", "..", "src", "routes", "deals"));
const customerHistoryRouterV61 = require(path.join(__dirname, "..", "..", "src", "routes", "customers.history"));
const garmentsRouterV63 = require(path.join(__dirname, "..", "..", "src", "routes", "garments.v63"));
const schedulerRouterV64 = require(path.join(__dirname, "..", "..", "src", "routes", "scheduler"));
const artQueueRouterV65 = require(path.join(__dirname, "..", "..", "src", "routes", "art.queue"));
const quotesRouterV67 = require(path.join(__dirname, "..", "..", "src", "routes", "quotes"));
const squareWebhookV69 = require(path.join(__dirname, "..", "..", "src", "routes", "square.webhook"));
const shopBoardRouter = require(path.join(__dirname, "..", "..", "src", "routes", "shop"));
const scheduleRouter = require(path.join(__dirname, "..", "..", "src", "routes", "schedule"));
const inventoryHttpRouter = require(path.join(__dirname, "..", "..", "src", "routes", "inventoryHttp"));
const vendorOutboundRouter = require(path.join(__dirname, "..", "..", "src", "routes", "vendorOutbound"));
const intakeRouter = require(path.join(__dirname, "..", "..", "src", "routes", "intake"));
const squareTruthRouter = require(path.join(__dirname, "..", "..", "src", "routes", "squareTruth"));
const communicationsRouter = require(path.join(__dirname, "..", "..", "src", "routes", "communications"));
const executiveRouter = require(path.join(__dirname, "..", "..", "src", "routes", "executive"));
const teamRouter = require(path.join(__dirname, "..", "..", "src", "routes", "team"));
const serviceDeskRouter = require(path.join(__dirname, "..", "..", "src", "routes", "serviceDesk"));
const contentRouter = require(path.join(__dirname, "..", "..", "src", "routes", "content"));
const controlTowerRouter = require(path.join(__dirname, "..", "..", "src", "routes", "controlTower"));
const setupRouter = require(path.join(__dirname, "..", "..", "src", "routes", "setup"));
const helpRouter = require(path.join(__dirname, "..", "..", "src", "routes", "help"));
const inboundHttpRouter = require(path.join(__dirname, "..", "..", "src", "routes", "inboundHttp"));
const timelineHttpRouter = require(path.join(__dirname, "..", "..", "src", "routes", "timelineHttp"));
const artInboundHttpRouter = require(path.join(__dirname, "..", "..", "src", "routes", "artInboundHttp"));
const notesHttpRouter = require(path.join(__dirname, "..", "..", "src", "routes", "notesHttp"));
const goLiveHttpRouter = require(path.join(__dirname, "..", "..", "src", "routes", "goLiveHttp"));
const tasksHttpRouter = require(path.join(__dirname, "..", "..", "src", "routes", "tasksHttp"));
const operatorRouter = require(path.join(__dirname, "..", "..", "src", "routes", "operator"));

/** Render/cloud: PORT; local override: CHEEKY_OS_PORT. */
const PORT = Number(process.env.PORT || process.env.CHEEKY_OS_PORT || 3000);
const HOST = "0.0.0.0";
console.log("🚀 CHEEKY OS LOCKED — v8.7 STABLE");

const app = express();

process.on("uncaughtException", (err) => {
  console.error(
    "[PROCESS] uncaughtException | fail |",
    err && err.stack ? err.stack : err
  );
});

process.on("unhandledRejection", (reason) => {
  console.error("[PROCESS] unhandledRejection | fail |", reason);
});

app.get("/", (_req, res) => {
  res.send("Cheeky OS is running");
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

function bootEntryLabel() {
  const main = require.main && require.main.filename;
  if (!main) return "unknown";
  const n = String(main).replace(/\\/g, "/");
  if (n.endsWith("/render-http.js")) return "render-http.js→cheeky-os/server.js";
  if (n.endsWith("/cheeky-os/server.js") || n.endsWith("/server.js"))
    return "cheeky-os/server.js";
  return path.basename(main);
}

function logBootContext(phase) {
  const nodeEnv = process.env.NODE_ENV || "development";
  const viaRender =
    require.main &&
    String(require.main.filename || "").replace(/\\/g, "/").endsWith("/render-http.js");
  const mode =
    viaRender || nodeEnv === "production" ? "production-like" : "dev-like";
  console.log(`[boot] phase=${phase} entry=${bootEntryLabel()}`);
  console.log(`[boot] mode=${mode} NODE_ENV=${nodeEnv}`);
  console.log(
    `[boot] port=${PORT} host=${HOST} PORT=${process.env.PORT ? "set" : "unset"} CHEEKY_OS_PORT=${process.env.CHEEKY_OS_PORT ? "set" : "unset"}`
  );
  console.log(`[boot] health=GET /health · GET /healthz · GET /system/health`);
  console.log(
    `[boot] squareWebhookCanonical=POST /api/square/webhook (configure Square Dashboard here)`
  );
  console.log(
    `[boot] squareWebhookMirror=POST /webhooks/square/webhook (same handler; compatibility only)`
  );
  console.log(
    `[boot] squareWebhookLegacy=POST /api/square · POST /webhooks/square (JSON payment.completed only)`
  );
  const schedOn =
    process.env.ENABLE_SCHEDULER === "true" ||
    process.env.DAILY_SCHEDULER === "true";
  console.log(
    `[boot] scheduler=${schedOn ? "enabled (ENABLE_SCHEDULER or DAILY_SCHEDULER)" : "disabled"}`
  );
  if (!process.env.DATABASE_URL) {
    console.warn("[boot] warn=DATABASE_URL unset (database-backed routes may fail)");
  }
  const sig = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  console.log(
    `[boot] squareHmac=${sig ? "SQUARE_WEBHOOK_SIGNATURE_KEY set" : "unset (optional unless enforcing signature)"}`
  );
  if (process.env.SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY === "true") {
    console.warn(
      "[boot] warn=SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY=true (avoid in production)"
    );
  }
  logReadinessLines();
  console.log("[boot] route inventory: GET /system/routes");
}

app.use((req, res, next) => {
  if (process.env.CHEEKY_REQUEST_LOGS === "true") {
    console.log("➡️ INCOMING:", req.method, req.originalUrl);
  }
  if (req.method === "GET" && req.originalUrl === "/") {
    const accept = String(req.headers.accept || "");
    if (accept.includes("text/html")) {
      return next();
    }
    return res.status(200).json({
      reached: true,
      service: "cheeky-api",
      proof: "request reached express app",
      time: new Date().toISOString(),
    });
  }
  next();
});

app.get("/", (req, res) => {
  const accept = String(req.headers.accept || "");
  if (accept.includes("text/html")) {
    return res.sendFile(path.join(__dirname, "..", "public", "control-tower.html"));
  }
  res.status(200).json({
    status: "ok",
    service: "cheeky-api",
    env: process.env.NODE_ENV || "production",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    controlTower: "GET /control-tower · browser UI: send Accept: text/html to GET /",
  });
});

app.get("/healthz", (_req, res) => {
  res.send("ok");
});

app.get("/health", (_req, res) => {
  const sv = global.__CHEEKY_STARTUP_VALIDATION__;
  res.json({
    ok: true,
    status: "ok",
    service: "cheeky-os",
    port: PORT,
    time: new Date().toISOString(),
    deploy: sv
      ? {
          startupOk: sv.ok,
          criticalCount: sv.critical.length,
          warningCount: sv.warnings.length,
        }
      : null,
  });
});

/** Cheeky OS v3.2 — strict JSON envelope for probes + automation */
app.get("/api/health", (_req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        status: "ok",
        service: "cheeky-os",
        version: "3.3",
        time: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[api/health]", err && err.stack ? err.stack : err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "health_failed",
      code: "HEALTH_ERROR",
    });
  }
});

app.get("/system/health", (_req, res) => {
  const report = getSystemHealthReport(app);
  res.json({
    ok: report.status !== "RED",
    service: "cheeky-os",
    port: PORT,
    ...report,
    time: new Date().toISOString(),
  });
});

/** Static staff dashboard (manual / operator workflow). */
app.get("/staff", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "staff-dashboard.html"));
});

/** Owner Command Center (minimal, Square-like UI). Additive — does not touch existing "/" JSON probe. */
app.get("/command-center", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "command-center.html"));
});

app.get("/social", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "social.html"));
});

/** Shop Mode workboard — the 3-column operator floor view. Additive. */
app.get(["/workboard", "/floor", "/shop-mode"], (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

/** Role-based operator console (execution UI). */
app.get("/operator-console", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "operator.html"));
});

/** Bundle 19 — GET /system/check (keep after /system/health so health stays exact match). */
app.use("/system", systemCheckRouter);

// Ops snapshot probe (additive, separate from existing /system/status in systemCheckRouter).
try {
  const { getSystemStatus: _getSystemStatus } = require(path.join(__dirname, "..", "..", "src", "services", "statusEngine"));
  const ctrl = require(path.join(__dirname, "..", "..", "src", "services", "systemControlService"));
  app.get("/system/state", (_req, res) => {
    try {
      const status = _getSystemStatus() || {};
      try {
        ctrl.noteHealthStatus(status.health);
      } catch (_e) {
        /* optional */
      }
      const control = ctrl.getSystemState();
      return res.status(200).json({
        success: true,
        ...status,
        running: control.running,
        paused: control.paused,
        pausedBy: control.pausedBy,
        locked: control.locked,
        lockedBy: control.lockedBy,
        safeMode: control.safeMode,
        safeModeReason: control.safeModeReason,
        controlTimestamp: control.timestamp,
      });
    } catch (err) {
      return res.status(200).json({ success: false, error: err && err.message ? err.message : "status_error" });
    }
  });
} catch (err) {
  console.warn("[server] /system/state mount failed:", err && err.message ? err.message : err);
}

app.use("/api/operator", depositFollowupsRouter);
app.use("/operator", depositFollowupsRouter);
app.use("/api/operator", garmentOperatorListRouter);
app.use("/operator", garmentOperatorListRouter);

const squareWebhook = require("../src/webhooks/squareWebhook");
// Canonical invoice pipeline: raw body BEFORE express.json (byte-exact Square HMAC).
if (typeof squareWebhook.mountCanonicalInvoiceRaw === "function") {
  squareWebhook.mountCanonicalInvoiceRaw(app);
}
app.use("/webhooks/square", express.raw({ type: "*/*" }));
app.use(express.json());
app.use(require("./src/routes/aiExecute.route"));
app.use(require("./src/routes/operator.route"));
app.use(require("./src/routes/dashboard.route"));
app.use(require("./src/routes/sales.route"));
app.use(require("./src/routes/control.route"));
app.use(require("./src/routes/lead.route"));
app.use(require("./src/routes/pipeline.route"));
app.use(require("./src/routes/approvals.route"));
app.use(require("./src/routes/payment.route"));
app.use(require("./src/routes/squarePaymentSync.route"));
app.use(require("./src/routes/paymentStatus.route"));
app.use(require("./src/routes/release.route"));
app.use(require("./src/routes/vendorDraft.route"));
app.use(require("./src/routes/readiness.route"));
app.use(require("./src/routes/systemStatus.route"));
app.use(require("./src/routes/agentInsights.route"));
app.use(require("./src/routes/autopilotStatus.route"));
app.use(require("./src/routes/followupsStatus.route"));
const chatgptRouteModule = require("./src/routes/chatgpt.route");
app.use(chatgptRouteModule);
console.log(
  "[ROUTES] ChatGPT routes module mounted from ./src/routes/chatgpt.route; HTTP paths are /api/chatgpt/* (includes GET /api/chatgpt/launch-check)"
);
app.use(require("./src/routes/mobileOperator.route"));
app.use(require("./src/routes/decision.route"));
app.use(require("./src/routes/cash.route"));
app.use(require("./src/routes/flow.route"));

try {
  const ordersV32Router = require(path.join(__dirname, "..", "..", "src", "routes", "orders"));
  app.use("/api/orders", ordersV32Router);
} catch (err) {
  console.warn("[cheeky-os] v3.2 /api/orders mount failed:", err && err.message ? err.message : err);
}

try {
  const estimatesV32 = require(path.join(__dirname, "..", "..", "src", "routes", "estimates"));
  app.use("/api/estimates", estimatesV32);
} catch (err) {
  console.warn("[cheeky-os] v3.2 /api/estimates mount failed:", err && err.message ? err.message : err);
}

try {
  const autoEstimatesV34 = require(path.join(__dirname, "..", "..", "src", "routes", "estimates.auto"));
  app.use("/api/estimates", autoEstimatesV34);
} catch (err) {
  console.warn("[cheeky-os] v3.4 /api/estimates auto mount failed:", err && err.message ? err.message : err);
}

try {
  const artV32 = require(path.join(__dirname, "..", "..", "src", "routes", "art"));
  app.use("/api/orders", artV32);
} catch (err) {
  console.warn("[cheeky-os] v3.2 art routes mount failed:", err && err.message ? err.message : err);
}

try {
  const garmentsV32 = require(path.join(__dirname, "..", "..", "src", "routes", "garments"));
  app.use("/api/orders", garmentsV32);
} catch (err) {
  console.warn("[cheeky-os] v3.2 garments routes mount failed:", err && err.message ? err.message : err);
}

try {
  const garmentsShortV33 = require(path.join(__dirname, "..", "..", "src", "routes", "garmentsShort"));
  app.use("/api/garments", garmentsShortV33);
} catch (err) {
  console.warn("[cheeky-os] v3.3 /api/garments mount failed:", err && err.message ? err.message : err);
}

try {
  const paymentsV32 = require(path.join(__dirname, "..", "..", "src", "routes", "payments"));
  app.use("/api/payments", paymentsV32);
} catch (err) {
  console.warn("[cheeky-os] v3.2 /api/payments mount failed:", err && err.message ? err.message : err);
}

try {
  const webhooksV32 = require(path.join(__dirname, "..", "..", "src", "routes", "webhooks"));
  app.use("/api/cheeky-webhooks", webhooksV32);
} catch (err) {
  console.warn("[cheeky-os] v3.2 /api/cheeky-webhooks mount failed:", err && err.message ? err.message : err);
}

try {
  const tasksV32 = require(path.join(__dirname, "..", "..", "src", "routes", "tasks"));
  app.use("/api/os/tasks", tasksV32);
} catch (err) {
  console.warn("[cheeky-os] v3.2 /api/os/tasks mount failed:", err && err.message ? err.message : err);
}

try {
  const workordersV32 = require(path.join(__dirname, "..", "..", "src", "routes", "workorders"));
  app.use("/api/workorders", workordersV32);
} catch (err) {
  console.warn("[cheeky-os] v3.2 /api/workorders mount failed:", err && err.message ? err.message : err);
}

try {
  const reportsOs = require(path.join(__dirname, "..", "..", "src", "routes", "reports"));
  app.use("/api/reports/os", reportsOs);
} catch (err) {
  console.warn("[cheeky-os] v3.2 /api/reports/os mount failed:", err && err.message ? err.message : err);
}

try {
  const revenueFollowupsV34 = require(path.join(__dirname, "..", "..", "src", "routes", "revenue.followups"));
  app.use("/api/revenue", revenueFollowupsV34);
  app.use("/api/revenue/followups", revenueFollowupsV34);
} catch (err) {
  console.warn("[cheeky-os] v3.4 /api/revenue mount failed:", err && err.message ? err.message : err);
}

try {
  const productionBoardV36 = require(path.join(__dirname, "..", "..", "src", "routes", "production.board"));
  app.use(productionBoardV36);
} catch (err) {
  console.warn("[cheeky-os] v3.6 production board mount failed:", err && err.message ? err.message : err);
}

try {
  const productionActionsV36 = require(path.join(__dirname, "..", "..", "src", "routes", "production.actions"));
  app.use(productionActionsV36);
} catch (err) {
  console.warn("[cheeky-os] v3.6 production actions mount failed:", err && err.message ? err.message : err);
}

try {
  const garmentOrdersV37 = require(path.join(__dirname, "..", "..", "src", "routes", "garment.orders"));
  app.use(garmentOrdersV37);
} catch (err) {
  console.warn("[cheeky-os] v3.7 garment orders mount failed:", err && err.message ? err.message : err);
}

try {
  const printQueueV38 = require(path.join(__dirname, "..", "..", "src", "routes", "print.queue"));
  app.use(printQueueV38);
} catch (err) {
  console.warn("[cheeky-os] v3.8 print queue mount failed:", err && err.message ? err.message : err);
}

try {
  const printActionsV38 = require(path.join(__dirname, "..", "..", "src", "routes", "print.actions"));
  app.use(printActionsV38);
} catch (err) {
  console.warn("[cheeky-os] v3.8 print actions mount failed:", err && err.message ? err.message : err);
}

try {
  const printPriorityV39 = require(path.join(__dirname, "..", "..", "src", "routes", "print.priority"));
  app.use(printPriorityV39);
} catch (err) {
  console.warn("[cheeky-os] v3.9 print priority mount failed:", err && err.message ? err.message : err);
}

try {
  const dashboardApiV40 = require(path.join(__dirname, "..", "..", "src", "routes", "dashboard.api"));
  app.use(dashboardApiV40);
} catch (err) {
  console.warn("[cheeky-os] v4.0 dashboard api mount failed:", err && err.message ? err.message : err);
}

try {
  const communicationsV41 = require(path.join(__dirname, "..", "..", "src", "routes", "communications"));
  app.use(communicationsV41);
} catch (err) {
  console.warn("[cheeky-os] v4.1 communications mount failed:", err && err.message ? err.message : err);
}

try {
  const sendApprovalV42 = require(path.join(__dirname, "..", "..", "src", "routes", "send.approval"));
  app.use(sendApprovalV42);
} catch (err) {
  console.warn("[cheeky-os] v4.2 send approval mount failed:", err && err.message ? err.message : err);
}

try {
  const productionJobsV44 = require(path.join(__dirname, "..", "..", "src", "routes", "production.jobs"));
  app.use(productionJobsV44);
} catch (err) {
  console.warn("[cheeky-os] v4.4 production jobs mount failed:", err && err.message ? err.message : err);
}

try {
  const workordersV45 = require(path.join(__dirname, "..", "..", "src", "routes", "workorders"));
  app.use(workordersV45);
} catch (err) {
  console.warn("[cheeky-os] v4.5 workorders mount failed:", err && err.message ? err.message : err);
}

try {
  const outsourceArtV46 = require(path.join(__dirname, "..", "..", "src", "routes", "outsource.art"));
  app.use(outsourceArtV46);
} catch (err) {
  console.warn("[cheeky-os] v4.6 outsource art mount failed:", err && err.message ? err.message : err);
}

try {
  const outsourceShippingV46 = require(path.join(__dirname, "..", "..", "src", "routes", "outsource.shipping"));
  app.use(outsourceShippingV46);
} catch (err) {
  console.warn("[cheeky-os] v4.6 outsource shipping mount failed:", err && err.message ? err.message : err);
}

try {
  const outsourceBoardV46 = require(path.join(__dirname, "..", "..", "src", "routes", "outsource.board"));
  app.use(outsourceBoardV46);
} catch (err) {
  console.warn("[cheeky-os] v4.6 outsource board mount failed:", err && err.message ? err.message : err);
}

try {
  const leadsV47 = require(path.join(__dirname, "..", "..", "src", "routes", "leads"));
  app.use(leadsV47);
} catch (err) {
  console.warn("[cheeky-os] v4.7 leads mount failed:", err && err.message ? err.message : err);
}

try {
  const squareStatusV50 = require(path.join(__dirname, "..", "..", "src", "routes", "square.status"));
  app.use("/api/square", squareStatusV50);
} catch (err) {
  console.warn("[cheeky-os] v5.0 square status mount failed:", err && err.message ? err.message : err);
}

try {
  const followupsV51 = require(path.join(__dirname, "..", "..", "src", "routes", "followups"));
  app.use("/api/followups", followupsV51);
} catch (err) {
  console.warn("[cheeky-os] v5.1 followups mount failed:", err && err.message ? err.message : err);
}

try {
  const followupActionsV52 = require(path.join(__dirname, "..", "..", "src", "routes", "followup.actions"));
  app.use("/api/followups", followupActionsV52);
} catch (err) {
  console.warn("[cheeky-os] v5.2 followup actions mount failed:", err && err.message ? err.message : err);
}

try {
  const portalV55 = require(path.join(__dirname, "..", "..", "src", "routes", "portal"));
  app.use(portalV55);
} catch (err) {
  console.warn("[cheeky-os] v5.5 portal mount failed:", err && err.message ? err.message : err);
}

try {
  const pickupV71 = require(path.join(__dirname, "..", "..", "src", "routes", "pickup"));
  app.use(pickupV71);
} catch (err) {
  console.warn("[cheeky-os] v7.1 pickup mount failed:", err && err.message ? err.message : err);
}

try {
  const autoV73 = require(path.join(__dirname, "..", "..", "src", "routes", "auto"));
  app.use(autoV73);
} catch (err) {
  console.warn("[cheeky-os] v7.3 auto route mount failed:", err && err.message ? err.message : err);
}

try {
  const growthV75 = require(path.join(__dirname, "..", "..", "src", "routes", "growth"));
  app.use(growthV75);
} catch (err) {
  console.warn("[cheeky-os] v7.5 growth route mount failed:", err && err.message ? err.message : err);
}

try {
  const notificationsV76 = require(path.join(__dirname, "..", "..", "src", "routes", "notifications"));
  app.use(notificationsV76);
} catch (err) {
  console.warn("[cheeky-os] v7.6 notifications route mount failed:", err && err.message ? err.message : err);
}

try {
  const actionsV77 = require(path.join(__dirname, "..", "..", "src", "routes", "actions"));
  app.use(actionsV77);
} catch (err) {
  console.warn("[cheeky-os] v7.7 actions route mount failed:", err && err.message ? err.message : err);
}

try {
  const kpiV78 = require(path.join(__dirname, "..", "..", "src", "routes", "kpi"));
  app.use(kpiV78);
} catch (err) {
  console.warn("[cheeky-os] v7.8 kpi route mount failed:", err && err.message ? err.message : err);
}

try {
  const adminV79 = require(path.join(__dirname, "..", "..", "src", "routes", "admin"));
  app.use(adminV79);
} catch (err) {
  console.warn("[cheeky-os] v7.9 admin route mount failed:", err && err.message ? err.message : err);
}

try {
  const auditV80 = require(path.join(__dirname, "..", "..", "src", "routes", "audit"));
  app.use(auditV80);
} catch (err) {
  console.warn("[cheeky-os] v8.0 audit route mount failed:", err && err.message ? err.message : err);
}

try {
  const insightsV81 = require(path.join(__dirname, "..", "..", "src", "routes", "insights"));
  app.use(insightsV81);
} catch (err) {
  console.warn("[cheeky-os] v8.1 insights route mount failed:", err && err.message ? err.message : err);
}

try {
  const selfHealV83 = require(path.join(__dirname, "..", "..", "src", "routes", "selfheal"));
  app.use(selfHealV83);
} catch (err) {
  console.warn("[cheeky-os] v8.3 self-heal route mount failed:", err && err.message ? err.message : err);
}

try {
  const memoryV84 = require(path.join(__dirname, "..", "..", "src", "routes", "memory"));
  app.use(memoryV84);
} catch (err) {
  console.warn("[cheeky-os] v8.4 memory route mount failed:", err && err.message ? err.message : err);
}

try {
  const predictionsV85 = require(path.join(__dirname, "..", "..", "src", "routes", "predictions"));
  app.use(predictionsV85);
} catch (err) {
  console.warn("[cheeky-os] v8.5 predictions route mount failed:", err && err.message ? err.message : err);
}

try {
  const campaignsV86 = require(path.join(__dirname, "..", "..", "src", "routes", "campaigns"));
  app.use(campaignsV86);
} catch (err) {
  console.warn("[cheeky-os] v8.6 campaigns route mount failed:", err && err.message ? err.message : err);
}

try {
  const financeV87 = require(path.join(__dirname, "..", "..", "src", "routes", "finance"));
  app.use(financeV87);
} catch (err) {
  console.warn("[cheeky-os] v8.7 finance route mount failed:", err && err.message ? err.message : err);
}

try {
  const engineRunRoute = require(path.join(__dirname, "..", "..", "src", "routes", "engine.run"));
  app.use("/api/engine", engineRunRoute);
} catch (err) {
  console.warn("[cheeky-os] /api/engine mount failed:", err && err.message ? err.message : err);
}

try {
  require(path.join(__dirname, "..", "..", "src", "services", "aiHooks"));
} catch (err) {
  console.warn("[cheeky-os] v3.2 aiHooks load failed:", err && err.message ? err.message : err);
}

try {
  const squareImportV33 = require(path.join(__dirname, "..", "..", "src", "routes", "square.import.js"));
  app.use("/api/square/import", squareImportV33);
} catch (err) {
  console.warn("[cheeky-os] v3.3 /api/square/import mount failed:", err && err.message ? err.message : err);
}

const viewsRoot = path.join(__dirname, "..", "..", "src", "views");
app.get("/jeremy", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "jeremy.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/cheeky-dashboard", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "dashboard.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/dashboard", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "dashboard.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/ops", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "ops.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/calendar", (_req, res) => res.send("Calendar coming soon"));
app.get("/tasks", (_req, res) => res.send("Tasks view coming soon"));
app.get("/production", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "production.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/orders/new", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "new-order.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/start-order", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "intake.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/portal/:token", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "portal.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/art", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "art.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/estimates/new", (_req, res) => res.send("New estimate UI coming"));
app.get("/calculator", (_req, res) => res.send("Calculator coming"));
app.get("/notes", (_req, res) => res.send("Notes coming"));
app.get("/marketing", (_req, res) => res.send("Marketing coming"));
app.get("/admin", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "admin.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/audit", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "audit.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});
app.get("/leads", (_req, res) => {
  try {
    res.sendFile(path.join(viewsRoot, "leads.html"));
  } catch (e) {
    res.status(500).send("view error");
  }
});

try {
  const systemOpsRouter = require(path.join(__dirname, "..", "..", "src", "routes", "systemOps"));
  app.use("/system", systemOpsRouter);
} catch (err) {
  console.warn("[server] systemOps routes failed:", err && err.message ? err.message : err);
}

const operatorRunRouter = require("./routes/operatorRun");
app.use("/api/operator", operatorRunRouter);
app.use("/operator", operatorRunRouter);
app.use("/api/ai", aiExecuteRouter);
app.use("/api/ai", aiContextRouter);
app.use("/api/autopilot", autopilotApiRouter);
try {
  const reportsDailyV33 = require(path.join(__dirname, "..", "..", "src", "routes", "reportsDailyV33"));
  app.use("/api/reports", reportsDailyV33);
} catch (err) {
  console.warn("[cheeky-os] v3.3 /api/reports daily mount failed:", err && err.message ? err.message : err);
}
app.use("/api/reports", reportsRouter);
try {
  const socialRoutesModule = require(path.join(
    __dirname,
    "..",
    "dist",
    "routes",
    "socialRoutes.js"
  ));
  const socialRoutes = socialRoutesModule.default || socialRoutesModule;
  app.use("/api/social", socialRoutes);
} catch (e) {
  console.warn(
    "[server] social routes not loaded:",
    e && e.message ? e.message : e
  );
}
app.use("/api/commands", commandsRouter);
app.use("/api/phone", phoneIncomingRouter);
app.use("/cheeky-ai", cheekiAiRouter);
app.use("/collections", collectionsRouter);
app.use("/", emailIntakeManualRouter);
app.use("/", briefingRouter);
app.use("/data", dataSquareRouter);
app.use("/query", queryRouter);
app.use("/jobs", jobsRouter);
app.use("/tasks", tasksHttpRouter);
app.use("/operator", operatorRouter);
app.use("/api/operator", operatorRouter);
app.use("/webhooks", webhooksEmailRouter);
app.use("/ops/dashboard", cheekyDashboardRouter);
app.use("/dashboard/summary", cheekyDashboardRouter);
app.use("/production", productionQueueRouter);
app.use("/purchasing", purchasingRouter);
app.use("/routing", routingDecisionsRouter);
app.use("/finance", financeSummaryRouter);
app.use("/command", commandRouterExpress);
app.use("/api/command", commandRouterExpress);
app.use("/api/ai", aiCommandRouterV57);
app.use("/api/ai-status", aiStatusRouterV58);
app.use("/api/cashflow", cashflowRouterV59);
app.use(dealsRouterV60);
app.use(customerHistoryRouterV61);
app.use(garmentsRouterV63);
app.use(schedulerRouterV64);
app.use(artQueueRouterV65);
app.use(quotesRouterV67);
app.use(squareWebhookV69);
app.use("/shop", shopBoardRouter);
app.use("/schedule", scheduleRouter);
app.use("/inventory", inventoryHttpRouter);
app.use("/vendor/outbound", vendorOutboundRouter);
app.use("/intake", intakeRouter);
app.use("/communications", communicationsRouter);
app.use("/content", contentRouter);
app.use("/control-tower", controlTowerRouter);
app.use("/setup", setupRouter);
app.use("/help", helpRouter);
app.use("/inbound", inboundHttpRouter);
app.use("/timeline", timelineHttpRouter);
app.use("/art", artInboundHttpRouter);
app.use("/notes", notesHttpRouter);
app.use("/go-live", goLiveHttpRouter);
app.use("/executive", executiveRouter);
app.use("/team", teamRouter);
app.use("/service-desk", serviceDeskRouter);
app.use("/api/service-desk", serviceDeskRouter);

// Payment-only JSON routes: POST /api/square, POST /webhooks/square
app.use("/api", squareWebhook);
app.use("/webhooks", squareWebhook);

app.get('/money-engine/health', (req, res) => {
  res.json({
    ok: true,
    emailPolling: 'disabled',
    webhook: '/webhooks/square/webhook'
  });
});

app.use("/cheeky", cheekyRouter);
app.use("/revenue", revenueRouter);
app.use("/dashboard", dashboardRouter);
app.use("/dashboard", dashboardNextRouter);
app.use("/square", squareTruthRouter);
app.use("/square", squareDraftRouter);
app.use("/sales", salesRouter);
app.use("/capture", captureRouter);
app.use("/orders", ordersCaptureRouter);
app.use("/orders", ordersStatusRouter);
app.use("/orders", ordersMemoryRouter);
app.use("/orders", ordersIntelligenceRouter);
app.use("/api/orders", garmentOrderMarkRouter);
app.use("/production", productionRouter);
app.use("/alerts", alertsRouter);
app.use("/ops", opsTodayRouter);
app.use("/founder", founderTodayRouter);
app.use("/automation", automationRouter);
app.use("/summary", summaryTodayRouter);
app.use("/copilot", copilotTodayRouter);
app.use("/notifications", notificationsRouter);
app.use("/responses", responsesRouter);
app.use("/runbook", runbookRouter);
app.use("/autopilot", autopilotRouter);
app.use("/pricing", pricingRouter.router);
app.use("/cash", cashRouter);
app.use("/cash", cashBlitzRouter);
app.use("/exceptions", exceptionsRouter);
app.use("/ledger", ledgerRouter);
app.use(scorecardRouter);
app.use("/goals", goalsRouter);
app.use("/next", nextActionsRouter);
app.use("/auto", autoExecutionRouter);
app.use("/reactivation", reactivationRouter);
app.use("/leads", leadsRouter);
app.use("/retargeting", retargetingRouter);
app.use("/memory", memoryRouter);
app.use("/api/memory", memoryRouter);
app.use(appCenterRouter);
app.use("/", mobileDashboardRouter);

// Optional /api/* mirrors for tooling and curl docs (same routers; no duplicate handlers).
try {
  const productionQueueV33 = require(path.join(__dirname, "..", "..", "src", "routes", "productionQueueV33"));
  app.use("/api/production", productionQueueV33);
} catch (err) {
  console.warn("[cheeky-os] v3.3 /api/production queue mount failed:", err && err.message ? err.message : err);
}
app.use("/api/production", productionRouter);
app.use("/api/sales", salesRouter);
app.use("/api/summary", summaryTodayRouter);
app.use("/api/automation", automationRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/dashboard", dashboardNextRouter);
app.use("/api/square", squareTruthRouter);
app.use("/api/square", squareDraftRouter);
app.use("/api/ops", opsTodayRouter);
app.use("/api/next", nextActionsRouter);
app.use("/api/tasks", taskAdvanceRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/inventory", inventoryHttpRouter);
app.use("/api/vendor/outbound", vendorOutboundRouter);
app.use("/api/intake", intakeRouter);
app.use("/api/ads", adsAnalyzeRouter);
app.use("/api/system", kaizenRouter);
app.use("/api/art", artRouter);
app.use("/api/proofs", proofsRouter);
app.use("/proofs", proofsRouter);
app.use("/api/comms", commsRouter);
app.use("/api/work-orders", workOrdersRouter);
app.use("/work-orders", workOrdersRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/orders", orderFilesRouter);

// Static UI: /styles.css, /dashboard.js, /assets/* (dashboard.html is served by GET /dashboard)
app.use(express.static(path.join(__dirname, "..", "public"), { index: false }));

// ==============================
// CHAD CODE BUILD ENDPOINT
// ==============================
app.post("/api/chad/build", express.json(), (req, res) => {
  try {
    const { command } = req.body;

    if (!command || command.trim() === "") {
      return res.status(400).json({ status: "BLOCKED", error: "Invalid command" });
    }

    const prompt = generateCursorPrompt(command);

    const tasksDir = path.join(__dirname, "tasks");
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }

    const filename = `task-${Date.now()}.md`;
    const filePath = path.join(tasksDir, filename);

    fs.writeFileSync(filePath, prompt, "utf8");

    return res.json({
      status: "READY",
      file: filename,
    });
  } catch (err) {
    return res.status(500).json({
      status: "BLOCKED",
      error: err.message,
    });
  }
});

// ==============================
// VIEW TASK
// ==============================
app.get("/api/chad/tasks/:file", (req, res) => {
  const filePath = path.join(__dirname, "tasks", req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not found");
  }

  res.type("text/plain").send(fs.readFileSync(filePath, "utf8"));
});

// ==============================
// CHAD AUTO EXECUTE
// ==============================
app.post("/api/chad/execute", async (req, res) => {
  try {
    const latestTaskPath = getLatestTask();

    if (!latestTaskPath) {
      return res.status(400).json({
        status: "BLOCKED",
        error: "No task file found",
      });
    }

    const taskContent = readTask(latestTaskPath);

    console.log("[CHAD EXECUTE]");
    console.log(taskContent.substring(0, 500));

    return res.json({
      status: "READY",
      message: "Task ready for execution",
      taskPreview: taskContent.substring(0, 500),
    });
  } catch (err) {
    return res.status(500).json({
      status: "BLOCKED",
      error: err.message,
    });
  }
});

// ==============================
// CHAD SAFE APPLY
// ==============================
app.post("/api/chad/apply", express.json(), (req, res) => {
  try {
    const { apply } = req.body;

    const latestTaskPath = getLatestTask();

    if (!latestTaskPath) {
      return res.status(400).json({
        status: "BLOCKED",
        error: "No task found",
      });
    }

    const taskText = readTask(latestTaskPath);

    const result = applyPatch({
      repoRoot: __dirname,
      taskText,
      apply: apply === true,
    });

    return res.json(result);
  } catch (err) {
    return res.status(500).json({
      status: "BLOCKED",
      error: err.message,
    });
  }
});

// ==============================
// CHAD VOICE COMMAND ENDPOINT
// ==============================
app.post("/api/chad/voice", express.json(), (req, res) => {
  try {
    const { transcript, caller, priority } = req.body;

    // VALIDATION
    if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
      return res.status(400).json({
        status: "BLOCKED",
        error: "Invalid transcript",
      });
    }

    if (transcript.length > 2000) {
      return res.status(400).json({
        status: "BLOCKED",
        error: "Transcript too long",
      });
    }

    // USE EXISTING GENERATOR
    const prompt = generateCursorPrompt(transcript, { caller, priority });

    // TASK DIRECTORY
    const tasksDir = path.join(__dirname, "tasks");
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }

    // FILE NAME
    const filename = `voice-task-${Date.now()}.md`;
    const filePath = path.join(tasksDir, filename);

    // WRITE FILE
    fs.writeFileSync(filePath, prompt, "utf8");

    console.log("[CHAD VOICE]");
    console.log(transcript);

    return res.json({
      status: "READY",
      source: "VOICE",
      file: filename,
    });
  } catch (err) {
    return res.status(500).json({
      status: "BLOCKED",
      error: err.message,
    });
  }
});

// ==============================
// CHAD PIPELINE (VOICE -> BUILD -> APPLY)
// ==============================
app.post("/api/chad/pipeline", express.json(), (req, res) => {
  try {
    const { transcript, caller, priority, apply } = req.body;

    // VALIDATION
    if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
      return res.status(400).json({
        status: "BLOCKED",
        error: "Invalid transcript",
      });
    }

    if (transcript.length > 2000) {
      return res.status(400).json({
        status: "BLOCKED",
        error: "Transcript too long",
      });
    }

    // 1) BUILD TASK
    const prompt = generateCursorPrompt(transcript, { caller, priority });

    const tasksDir = path.join(__dirname, "tasks");
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }

    const filename = `pipeline-task-${Date.now()}.md`;
    const filePath = path.join(tasksDir, filename);
    fs.writeFileSync(filePath, prompt, "utf8");

    // 2) DRY RUN OR APPLY
    const taskText = fs.readFileSync(filePath, "utf8");

    const result = applyPatch({
      repoRoot: __dirname,
      taskText,
      apply: apply === true, // default false -> DRY_RUN
    });

    return res.json({
      status: result.status,
      source: "PIPELINE",
      file: filename,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      status: "BLOCKED",
      error: err.message,
    });
  }
});

// ==============================
// CHAD EXTERNAL TRIGGER (SECURE)
// ==============================
app.post("/api/chad/trigger", express.json(), async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];

    // AUTH
    if (!apiKey || apiKey !== process.env.CHAD_API_KEY) {
      return res.status(401).json({
        status: "BLOCKED",
        error: "Unauthorized",
      });
    }

    const { transcript, apply, caller, priority } = req.body;

    // BASIC VALIDATION
    if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
      return res.status(400).json({
        status: "BLOCKED",
        error: "Invalid transcript",
      });
    }

    // FORWARD TO INTERNAL PIPELINE
    const response = await fetch("http://localhost:3000/api/chad/pipeline", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript,
        apply: apply === true,
        caller: caller || "external",
        priority: priority || "normal",
      }),
    });

    const data = await response.json();

    return res.json({
      status: data.status,
      source: "EXTERNAL_TRIGGER",
      pipeline: data,
    });
  } catch (err) {
    return res.status(500).json({
      status: "BLOCKED",
      error: err.message,
    });
  }
});

// ===== FINAL GUARANTEED ROOT FALLBACK (MUST BE LAST) =====
app.use((req, res) => {
  if (req.method === "GET" && req.path === "/") {
    return res.status(200).json({
      status: "ok",
      service: "cheeky-api",
      env: process.env.NODE_ENV || "production",
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }

  const wantsJson =
    (req.headers.accept && String(req.headers.accept).includes("application/json")) ||
    String(req.path || "").startsWith("/api") ||
    String(req.originalUrl || "").startsWith("/api");
  if (wantsJson) {
    return res.status(404).json({
      success: false,
      error: "Not Found",
      path: req.originalUrl || req.url,
    });
  }
  res.status(404).send("Not Found");
});
// ===== END FALLBACK =====

app.use((err, req, res, _next) => {
  console.error("[cheeky-os/server]", req.method, req.url, err.message || err);
  res.status(500).json({
    success: false,
    ok: false,
    error: err.message || "error",
  });
});

async function main() {
  warnStrictEnv();
  logBootContext("prelisten");
  try {
    const { ensureDirectories } = require(path.join(__dirname, "..", "..", "src", "utils", "ensureDirectories"));
    ensureDirectories();
  } catch (e) {
    console.warn("[ensureDirectories] failed:", e && e.message ? e.message : e);
  }
  try {
    const { runStartupValidation } = require(path.join(__dirname, "..", "..", "src", "services", "startupValidationService"));
    const { logOpsEvent } = require(path.join(__dirname, "..", "..", "src", "services", "opsEventLog"));
    const sv = await runStartupValidation(app);
    global.__CHEEKY_STARTUP_VALIDATION__ = sv;
    if (sv.critical.length) {
      console.error("[startupValidation] CRITICAL:", sv.critical.join(" | "));
    }
    if (sv.warnings.length) {
      console.warn("[startupValidation] warnings:", sv.warnings.slice(0, 25).join(" | "));
    }
    await logOpsEvent(
      "STARTUP_VALIDATION",
      `ok=${sv.ok} critical=${sv.critical.length} warnings=${sv.warnings.length}`
    );
    if (String(process.env.CHEEKY_EXIT_ON_CRITICAL || "").toLowerCase() === "true" && sv.critical.length) {
      console.error("[startupValidation] CHEEKY_EXIT_ON_CRITICAL=true — exiting.");
      process.exit(1);
    }
  } catch (e) {
    console.warn("[startupValidation] failed:", e && e.message ? e.message : e);
  }
  try {
    await initializeSquareIntegration();
  } catch (e) {
    console.warn("[cheeky-os/server] Square init non-fatal:", e.message || e);
  }
  try {
    const startupReport = getSystemHealthReport(app);
    console.log(
      `[systemEngine] startup status=${startupReport.status} missingKeys=${startupReport.missing_keys.length} brokenRoutes=${startupReport.broken_routes.length}`
    );
  } catch (e) {
    console.warn("[systemEngine] startup health scan failed:", e && e.message ? e.message : e);
  }
  if (String(process.env.BRIEFING_CRON_ENABLED || "").trim().toLowerCase() === "true") {
    try {
      const now = new Date();
      const next = new Date(now);
      next.setHours(7, 0, 0, 0);
      if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
      }
      setTimeout(() => {
        Promise.resolve(generateDailyBriefing({})).catch((err) => {
          console.warn("[briefingCron] run failed:", err && err.message ? err.message : err);
        });
        setInterval(() => {
          Promise.resolve(generateDailyBriefing({})).catch((err) => {
            console.warn("[briefingCron] interval failed:", err && err.message ? err.message : err);
          });
        }, 24 * 60 * 60 * 1000);
      }, next.getTime() - now.getTime());
      console.log("[briefingCron] enabled for daily 07:00 local run");
    } catch (e) {
      console.warn("[briefingCron] setup failed:", e && e.message ? e.message : e);
    }
  }

  setTimeout(() => {
    console.log("[ROUTE DUMP START]");
    try {
      if (app && app._router && app._router.stack) {
        app._router.stack
          .filter((r) => r.handle && r.handle.stack)
          .forEach((r) => {
            r.handle.stack
              .filter((s) => s.route)
              .forEach((s) => {
                const methods = s.route && s.route.methods ? Object.keys(s.route.methods) : [];
                const method = methods[0] || "?";
                if (method) {
                  console.log("[ROUTE]", method.toUpperCase(), r.regexp, s.route.path);
                }
              });
          });
      }
    } catch (dumpErr) {
      console.error(
        "[ROUTE DUMP] error:",
        dumpErr && dumpErr.message ? dumpErr.message : dumpErr
      );
    }
    console.log("[ROUTE DUMP END]");
  }, 500);

  app.listen(PORT, HOST, () => {
    const statelessMode = process.env.CHEEKY_STATELESS_MODE !== "false";
    console.log("[CHEEKY-OS v3.3] DECISION ENGINE + SQUARE INGEST LIVE");
    console.log(`Cheeky OS running on port ${PORT}`);
    console.log(`[boot] phase=listen ok=1 url=http://${HOST}:${PORT}`);
    console.log(`[cheeky-os] listening on http://${HOST}:${PORT}`);
    console.log(`[cheeky-os] health: http://127.0.0.1:${PORT}/health`);
    console.log(`[cheeky-os] system/health: http://127.0.0.1:${PORT}/system/health`);
    console.log(`[cheeky-os] system check: GET http://127.0.0.1:${PORT}/system/check`);
    console.log(
      `[cheeky-os] control tower: browser GET / · snapshot GET /control-tower · command POST /command`
    );
    console.log(`[cheeky-os] adoption: GET /setup/status · GET /help/:section · training POST /setup/training/enable`);
    console.log(`[cheeky-os] inbound+timeline: POST /inbound/email · GET /timeline/recent · GET /art/queue · POST /notes`);
    console.log(`[cheeky-os] go-live: GET /go-live/status · /go-live/readiness · POST /go-live/cutover`);
    console.log(
      `[cheeky-os] system automation: GET http://127.0.0.1:${PORT}/system/status · POST /system/start · POST /system/stop`
    );
    console.log(`[cheeky-os] reactivation: http://127.0.0.1:${PORT}/revenue/reactivation`);
    console.log(
      `[cheeky-os] reactivation targets: http://127.0.0.1:${PORT}/reactivation/targets · POST /reactivation/run`
    );
    console.log(
      `[cheeky-os] leads: POST /leads/capture · GET /leads/recent · POST /leads/respond · POST /leads/convert → http://127.0.0.1:${PORT}/leads/...`
    );
    console.log(
      `[cheeky-os] retargeting: GET /retargeting/targets · POST /retargeting/run → http://127.0.0.1:${PORT}/retargeting/...`
    );
    console.log(
      `[cheeky-os] production routing: POST http://127.0.0.1:${PORT}/production/route`
    );
    console.log(`[cheeky-os] followups: http://127.0.0.1:${PORT}/revenue/followups`);
    console.log(`[cheeky-os] scripts: http://127.0.0.1:${PORT}/revenue/scripts`);
    console.log(`[cheeky-os] next-action: http://127.0.0.1:${PORT}/dashboard/next-action`);
    console.log(`[cheeky-os] draft-invoice: POST http://127.0.0.1:${PORT}/square/create-draft-invoice`);
    console.log(`[cheeky-os] sales/command-center: http://127.0.0.1:${PORT}/sales/command-center`);
    console.log(
      `[cheeky-os] sales loop: GET http://127.0.0.1:${PORT}/sales/loop · POST http://127.0.0.1:${PORT}/sales/run`
    );
    console.log(
      `[cheeky-os] sales operator: POST http://127.0.0.1:${PORT}/sales/operator/run`
    );
    console.log(
      `[cheeky-os] responses: POST http://127.0.0.1:${PORT}/responses/ingest`
    );
    console.log(
      `[cheeky-os] responses: POST http://127.0.0.1:${PORT}/responses/queue-next-step`
    );
    console.log(
      `[cheeky-os] responses: POST http://127.0.0.1:${PORT}/responses/auto-invoice`
    );
    console.log(
      `[cheeky-os] responses: POST http://127.0.0.1:${PORT}/responses/prepare-reply`
    );
    console.log(
      `[cheeky-os] runbook: POST http://127.0.0.1:${PORT}/runbook/run`
    );
    console.log(
      `[cheeky-os] autopilot: GET http://127.0.0.1:${PORT}/autopilot/status · POST /autopilot/enable · POST /autopilot/disable · POST /autopilot/kill · POST /autopilot/restore`
    );
    console.log(
      `[cheeky-os] pricing: POST http://127.0.0.1:${PORT}/pricing/check`
    );
    console.log(
      `[cheeky-os] cash priorities: GET http://127.0.0.1:${PORT}/cash/priorities`
    );
    console.log(
      `[cheeky-os] deposit priorities: GET http://127.0.0.1:${PORT}/cash/deposits`
    );
    console.log(
      `[cheeky-os] exceptions: GET http://127.0.0.1:${PORT}/exceptions/pending · POST /exceptions/approve · POST /exceptions/reject`
    );
    console.log(`[cheeky-os] mobile: http://127.0.0.1:${PORT}/dashboard/today/mobile`);
    console.log(
      `[cheeky-os] capture quick-entry: POST http://127.0.0.1:${PORT}/capture/quick-entry`
    );
    console.log(
      `[cheeky-os] capture verbal-brief: POST http://127.0.0.1:${PORT}/capture/verbal-brief`
    );
    console.log(`[cheeky-os] capture founder: GET http://127.0.0.1:${PORT}/capture/founder`);
    console.log(
      `[cheeky-os] capture convert-to-order: POST http://127.0.0.1:${PORT}/capture/convert-to-order`
    );
    console.log(
      `[cheeky-os] orders from capture: POST http://127.0.0.1:${PORT}/orders/create-from-capture`
    );
    console.log(
      `[cheeky-os] orders generate-tasks: POST http://127.0.0.1:${PORT}/orders/generate-tasks`
    );
    console.log(
      `[cheeky-os] orders update-status: POST http://127.0.0.1:${PORT}/orders/update-status`
    );
    console.log(`[cheeky-os] production queue: GET http://127.0.0.1:${PORT}/production/queue`);
    console.log(`[cheeky-os] production mobile: GET http://127.0.0.1:${PORT}/production/mobile`);
    console.log(`[cheeky-os] alerts today: GET http://127.0.0.1:${PORT}/alerts/today`);
    console.log(`[cheeky-os] ops today: GET http://127.0.0.1:${PORT}/ops/today`);
    console.log(`[cheeky-os] founder today: GET http://127.0.0.1:${PORT}/founder/today`);
    console.log(`[cheeky-os] command center: GET http://127.0.0.1:${PORT}/app`);
    console.log(`[cheeky-os] summary today: GET http://127.0.0.1:${PORT}/summary/today`);
    console.log(`[cheeky-os] copilot today: GET http://127.0.0.1:${PORT}/copilot/today`);
    console.log(
      `[cheeky-os] notifications: POST http://127.0.0.1:${PORT}/notifications/send-alerts · POST /notifications/send-sms`
    );
    console.log(
      `[cheeky-os] automation actions: GET http://127.0.0.1:${PORT}/automation/actions`
    );
    console.log(
      `[cheeky-os] automation execute: POST http://127.0.0.1:${PORT}/automation/execute`
    );
    console.log(
      `[cheeky-os] automation prepare-message: POST http://127.0.0.1:${PORT}/automation/prepare-message`
    );
    console.log(
      `[cheeky-os] automation runner: GET /automation/status · POST /automation/run · POST /automation/toggle · GET /automation/logs (AUTOMATION_CRON_ENABLED=true)`
    );
    console.log(
      `[cheeky-os] orders add-note: POST http://127.0.0.1:${PORT}/orders/add-note`
    );
    console.log(
      `[cheeky-os] orders add-decision: POST http://127.0.0.1:${PORT}/orders/add-decision`
    );
    console.log(
      `[cheeky-os] orders intelligence: GET http://127.0.0.1:${PORT}/orders/intelligence/:orderId`
    );
    console.log(`[cheeky-os] legacy mount: http://127.0.0.1:${PORT}/cheeky/health`);

    startAutomation();
    startAgentScheduler();

    if (!statelessMode && process.env.ENABLE_FOLLOWUP_ENGINE === "true") {
      try {
        const { runFollowups } = require(path.join(
          __dirname,
          "..",
          "dist",
          "services",
          "followupEngine.js"
        ));
        if (typeof runFollowups === "function") {
          setInterval(() => {
            runFollowups().catch((e) =>
              console.error("[followupEngine]", e && e.message ? e.message : e)
            );
          }, 3600000);
          console.log(
            "[cheeky-os] followup engine: hourly runFollowups (ENABLE_FOLLOWUP_ENGINE=true)"
          );
        }
      } catch (e) {
        console.warn(
          "[cheeky-os] followup engine not started — run `npm run build` in email-intake:",
          e && e.message ? e.message : e
        );
      }
    }

    if (!statelessMode) {
      try {
        const { startAutomationScheduler } = require(path.join(
          __dirname,
          "..",
          "..",
          "src",
          "services",
          "automationScheduler.js"
        ));
        const sch = startAutomationScheduler();
        if (sch.started) {
          console.log(
            "[cheeky-os] automation scheduler: cron started (DAILY_SCHEDULER=true and AUTOMATION_CRON_ENABLED=true)"
          );
        } else {
          console.log("[cheeky-os] automation scheduler:", sch.reason || "off");
        }
      } catch (e) {
        console.warn("[cheeky-os] automation scheduler failed:", e && e.message ? e.message : e);
      }
    } else {
      console.log("[SAFE MODE] Stateless mode enabled; automation scheduler disabled");
    }

    if (!statelessMode) {
      try {
        const { startEmailPoller } = require(path.join(
          __dirname,
          "..",
          "dist",
          "services",
          "emailPoller.js"
        ));
        if (process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID) {
          startEmailPoller();
          console.log("[EmailIntake] Poller started");
        } else {
          console.warn("[EmailIntake] M365 vars missing — disabled");
        }
      } catch (e) {
        console.warn(
          "[EmailIntake] poller not started:",
          e && e.message ? e.message : e
        );
      }
    } else {
      console.log("[SAFE MODE] Stateless mode enabled; email poller disabled");
    }

    if (!statelessMode) {
      try {
        const { startSocialScheduler } = require(path.join(
          __dirname,
          "..",
          "dist",
          "services",
          "social",
          "socialScheduler.js"
        ));
        if (process.env.FB_PAGE_ID || process.env.IG_USER_ID) {
          startSocialScheduler();
          console.log("[SocialOS] Scheduler started");
        } else {
          console.warn("[SocialOS] Social vars missing — disabled");
        }
      } catch (e) {
        console.warn(
          "[SocialOS] scheduler not started:",
          e && e.message ? e.message : e
        );
      }
    } else {
      console.log("[SAFE MODE] Stateless mode enabled; social scheduler disabled");
    }
  });
  require("./src/operator/startProactive")();
  require("./src/operator/startAutoPilot")();
  require("./src/operator/startAutoFollowup")();
}

const _renderHttpBoot =
  require.main &&
  require.main.filename &&
  String(require.main.filename).replace(/\\/g, "/").endsWith("/render-http.js");
if (require.main === module || _renderHttpBoot) {
  main().catch((err) => {
    console.error("[cheeky-os/server] fatal:", err);
    process.exit(1);
  });
}

module.exports = { app, main };
