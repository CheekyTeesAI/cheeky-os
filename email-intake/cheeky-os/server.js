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
if (!String(process.env.CHEEKY_OS_BOOT_INTAKE_SELFTEST || "").trim())
  process.env.CHEEKY_OS_BOOT_INTAKE_SELFTEST = "false";
if (!String(process.env.CHEEKY_OS_STRICT_SCHEMA_CHECK || "").trim())
  process.env.CHEEKY_OS_STRICT_SCHEMA_CHECK = "false";
if (!String(process.env.CHEEKY_OS_ALLOW_PARTIAL_BOOT || "").trim())
  process.env.CHEEKY_OS_ALLOW_PARTIAL_BOOT = "true";
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

/**
 * Marketing Prisma (SQLite) — empty CHEEKY_MARKETING_DATABASE_URL breaks captureOrder reads.
 * Default to cheeky-os/prisma/marketing.db and create schema once if missing.
 */
(function ensureMarketingDatabaseEnv() {
  if (String(process.env.CHEEKY_MARKETING_DATABASE_URL || "").trim()) return;
  const dbFile = path.join(__dirname, "prisma", "marketing.db");
  process.env.CHEEKY_MARKETING_DATABASE_URL = `file:${dbFile.replace(/\\/g, "/")}`;
  try {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    if (!fs.existsSync(dbFile)) {
      const schemaPath = path.join(__dirname, "prisma", "schema.prisma");
      const quoted = JSON.stringify(schemaPath);
      execSync(`npx prisma db push --schema ${quoted} --accept-data-loss --skip-generate`, {
        cwd: path.join(__dirname, ".."),
        stdio: "pipe",
        env: process.env,
        shell: true,
      });
      console.log("[marketing-db] created SQLite + schema at cheeky-os/prisma/marketing.db");
    }
  } catch (e) {
    console.warn(
      "[marketing-db] bootstrap warning (set CHEEKY_MARKETING_DATABASE_URL or run prisma db push):",
      e && e.message ? e.message : e
    );
  }
})();

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
const { listenPort, logV4StartupValidation } = require("./services/cheekyOsRuntimeConfig.service");
try {
  logV4StartupValidation();
} catch (v4CfgErr) {
  console.warn(
    "[cheeky-v4] startup validation error:",
    v4CfgErr && v4CfgErr.message ? v4CfgErr.message : v4CfgErr
  );
}

try {
  require("./services/cheekyOsStructuredLog.service").initCheekyOsStructuredLog();
} catch (_sl) {
  /* optional */
}
const { generateCursorPrompt } = require("./src/ai/chadCodeGenerator");
const { applyPatch } = require("./src/ai/chadApply");
const { getLatestTask, readTask } = require("./src/ai/chadExecutor");
const { startAutomation } = require("./src/services/automationRunner");
const { startAgentScheduler } = require("./src/services/agentScheduler");

const express = require("express");
const { initializeSquareIntegration } = require("./integrations/square");
const cheekyRouter = require("./routes");
const revenueRouter = require("./routes/revenue");
const mobileDashboardRouter = require("./routes/mobileDashboard");
const dashboardNextRouter = require("./routes/dashboardNext");
const dashboardRouter = require("./routes/dashboard");
const approvalRoutesV5 = require("./routes/approvalRoutes");
const dashboardRoutesV5 = require("./routes/dashboardRoutes");
const systemHealthRoutesV5 = require("./routes/systemHealthRoutes");
const operatorConsoleJarvis = require("./routes/operatorConsole");
const executiveBriefingJarvis = require("./routes/executiveBriefing");
const observabilityRoutesV7 = require("./routes/observabilityRoutes");
const trustDashboardV7 = require("./routes/trustDashboard");
const operatorWorkflowRoutesV7 = require("./routes/operatorWorkflowRoutes");
const operatorEntryRoutesV8 = require("./routes/mainOperator");
const operatorDashboardRoutesV8 = require("./routes/operatorDashboard");
const workOrdersV8Router = require("./routes/workOrdersV8.route");
const garmentOrdersRoutesV8 = require("./routes/garmentOrders");
/** Cockpit Week Phase 1 — blocker-first reads + friction log + what-now (additive). */
const blockerDashboardRouter = require("./routes/blockerDashboard");
const whatNowRoutes = require("./routes/whatNowRoutes");
const frictionLogRoutes = require("./routes/frictionLogRoutes");
const draftingRoutes = require("./routes/draftingRoutes");
const shiftHandoffRoutes = require("./routes/shiftHandoffRoutes");
/** Phase 3 — growth scoring, outreach drafts (approval-gated), morning brief */
const growthRoutes = require("./routes/growthRoutes");
const outreachRoutes = require("./routes/outreachRoutes");
const morningBriefRoutes = require("./routes/morningBriefRoutes");
/** Phase 4 v4 — KPI, ads review, notifications, reporting, nightly exec review (additive). */
const kpiRoutes = require("./routes/kpiRoutes");
const googleAdsRoutes = require("./routes/googleAdsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reportingRoutes = require("./routes/reportingRoutes");
const nightlyGrowthReviewRoutes = require("./routes/nightlyGrowthReviewRoutes");
const customerQuickSearchRoutes = require("./routes/customerQuickSearchRoutes");
/** Phase 5 — customer status, self-service intake POST, monitoring envelope. */
const customerRoutes = require("./routes/customerRoutes");
const intakeRoutes = require("./routes/intakeRoutes");
const monitoringRoutes = require("./routes/monitoringRoutes");
/** Phase 7 — view descriptor, Cheeky-AI helpbot, accounting visibility, reporting/backup, team activity, full system status. */
const dashboardViewRoutes = require("./routes/dashboardViewRoutes");
const cheekyAiRoutes = require("./routes/cheekyAiRoutes");
const accountingRoutes = require("./routes/accountingRoutes");
const reportingAdvancedRoutes = require("./routes/reportingAdvancedRoutes");
const backupRoutes = require("./routes/backupRoutes");
const teamActivityRoutes = require("./routes/teamActivityRoutes");
const systemFullStatusRoutes = require("./routes/systemFullStatusRoutes");
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
const aiOperatorBrainRouter = require("./routes/aiOperator.route");
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
const cashflowSentinelRouterLocal = require("./routes/cashflow.route");
const cashflowApiCombined = express.Router();
cashflowApiCombined.use(cashflowSentinelRouterLocal);
cashflowApiCombined.use(cashflowRouterV59);
const dealsRouterV60 = require(path.join(__dirname, "..", "..", "src", "routes", "deals"));
const customerHistoryRouterV61 = require(path.join(__dirname, "..", "..", "src", "routes", "customers.history"));
const garmentsRouterV63 = require(path.join(__dirname, "..", "..", "src", "routes", "garments.v63"));
const schedulerRouterV64 = require(path.join(__dirname, "..", "..", "src", "routes", "scheduler"));
const artQueueRouterV65 = require(path.join(__dirname, "..", "..", "src", "routes", "art.queue"));
const quotesRouterV67 = require(path.join(__dirname, "..", "..", "src", "routes", "quotes"));
const squareWebhookV69 = require(path.join(__dirname, "..", "..", "src", "routes", "square.webhook"));
const shopBoardRouter = require(path.join(__dirname, "..", "..", "src", "routes", "shop"));
const squareCommandLayerRouter = require("./routes/squareCommand.route");
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
const aiOperatorBridgeHttpRouter = require("./routes/aiOperatorBridgeHttp.route");
const bridgeHttpRouter = require("./routes/bridgeHttp.route");
const memoryHttpRouter = require("./routes/memoryHttp.route");
const bridgeTaskRoutes = require("./routes/bridgeTasks");
const agentStatusRoute = require("./routes/agentStatus");
const transportRoutes = require("./bridge/transportServer");
const operatorBridgeRouter = require(path.join(__dirname, "..", "operatorBridge", "operator.routes"));
const squareSyncRouter = require(path.join(__dirname, "..", "squareSync", "squareSync.routes"));
const productionRoutingRouter = require(path.join(__dirname, "..", "productionRouting", "routing.routes"));
const activationRouter = require(path.join(__dirname, "..", "activation", "activation.routes"));
const activationRunner = require(path.join(__dirname, "..", "activation", "activation.runner"));

/** Render/cloud: PORT; local override: CHEEKY_OS_PORT (see cheekyOsRuntimeConfig.service.js). */
const PORT = listenPort();
const HOST = "0.0.0.0";

const app = express();

const { installProcessHandlers, startSelfFixSystem } = require("./services/selfFixService");
installProcessHandlers();

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
  const ctRaw = String(process.env.CHEEKY_CT_INTAKE_GATE_STRICT || "").trim().toLowerCase();
  const ctStrict =
    ctRaw === "true" || ctRaw === "1" || ctRaw === "on"
      ? true
      : ctRaw === "false" || ctRaw === "0" || ctRaw === "off"
        ? false
        : String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  console.log(
    `[boot] ctIntakeGateStrict=${ctStrict ? "ON (unset in prod defaults ON; Dataverse intake required before deposit applies)" : "off"}`
  );
  console.log(
    `[boot] observability=v4 (dashboard GET /dashboard, metrics GET /metrics) → GET /health, /api/health, /system/health`
  );
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

app.get("/", (_req, res) => res.redirect(302, "/dashboard"));

app.get("/healthz", (_req, res) => {
  res.send("ok");
});

app.get("/health", (_req, res) => {
  const sv = global.__CHEEKY_STARTUP_VALIDATION__;
  let observability = null;
  try {
    observability =
      require("./services/cheekyOsRuntimeObservability.service").getObservabilitySnapshot();
  } catch (_e) {
    observability = null;
  }
  const degradedMode = !!(
    sv &&
    ((Array.isArray(sv.critical) && sv.critical.length) ||
      (Array.isArray(sv.warnings) && sv.warnings.length))
  );
  res.status(200).json({
    ok: true,
    status: "ok",
    degradedMode,
    timestamp: new Date().toISOString(),
    service: "cheeky-os",
    port: PORT,
    node_env: process.env.NODE_ENV || "development",
    time: new Date().toISOString(),
    activeCrons: observability && Array.isArray(observability.activeCrons) ? observability.activeCrons : [],
    deploy: sv
      ? {
          startupOk: sv.ok,
          criticalCount: sv.critical.length,
          warningCount: sv.warnings.length,
        }
      : null,
    observability,
  });
});

/** Cheeky OS v3.2 — strict JSON envelope for probes + automation */
app.get("/api/health", (_req, res) => {
  try {
    let observability = null;
    try {
      observability =
        require("./services/cheekyOsRuntimeObservability.service").getObservabilitySnapshot();
    } catch (_e2) {}
    const { cheekyOsVersion } = require("./services/cheekyOsRuntimeConfig.service");
    return res.status(200).json({
      success: true,
      data: {
        status: "ok",
        service: "cheeky-os",
        version: cheekyOsVersion(),
        time: new Date().toISOString(),
        node_env: process.env.NODE_ENV || "development",
        observability,
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

try {
  const { mountProductionBoard } = require("./routes/productionBoard.route");
  mountProductionBoard(app);
  console.log("[production-board] GET /api/production-board (PRODUCTION_READY, PRINTING, QC, COMPLETED, STUCK)");
} catch (pbErr) {
  console.warn(
    "[production-board] mount failed:",
    pbErr && pbErr.message ? pbErr.message : pbErr
  );
}

app.get("/system/health", (_req, res) => {
  const report = getSystemHealthReport(app);
  let observability = null;
  try {
    observability =
      require("./services/cheekyOsRuntimeObservability.service").getObservabilitySnapshot();
  } catch (_e3) {}
  res.json({
    ok: report.status !== "RED",
    service: "cheeky-os",
    port: PORT,
    node_env: process.env.NODE_ENV || "development",
    ...report,
    observability,
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

try {
  const { mountOperatorStatus } = require("./routes/operatorStatus.route");
  mountOperatorStatus(app);
  console.log("[operator-status] GET /api/operator/status (system, cashGate, production, risks)");
} catch (opStErr) {
  console.warn(
    "[operator-status] mount failed:",
    opStErr && opStErr.message ? opStErr.message : opStErr
  );
}

try {
  const ownerRouter = require("./routes/owner.route");
  app.use("/api/owner", ownerRouter);
  console.log("[owner-command] GET /api/owner/summary (cash, production, comms, sales, risks)");
} catch (ownerErr) {
  console.warn(
    "[owner-command] mount failed:",
    ownerErr && ownerErr.message ? ownerErr.message : ownerErr
  );
}

/** Phase 3: morning brief registers before generic /api/operator stacks (path shadowing). */
try {
  app.use(morningBriefRoutes);
  console.log("[cockpit-phase3-morning] GET /api/operator/morning-brief (early mount)");
} catch (mbErr) {
  console.warn("[cockpit-phase3-morning] mount failed:", mbErr && mbErr.message ? mbErr.message : mbErr);
}

try {
  app.use(nightlyGrowthReviewRoutes);
  app.use(customerQuickSearchRoutes);
  console.log(
    "[cockpit-phase4] GET /api/operator/nightly-growth-review + GET /api/customers/quick-search (early mount before /api/operator umbrella)"
  );
} catch (p4EarlyErr) {
  console.warn("[cockpit-phase4] early mount failed:", p4EarlyErr && p4EarlyErr.message ? p4EarlyErr.message : p4EarlyErr);
}

// AI Operator Bridge (v1 scaffold) — mounted before main operator bridge so /test-last-email is reachable.
try {
  app.use("/api/operator", aiOperatorBridgeHttpRouter);
  console.log("[ai-operator-bridge] GET /api/operator/test-last-email (mailbox read scaffold)");
} catch (aiOpBrErr) {
  console.warn(
    "[ai-operator-bridge] mount failed:",
    aiOpBrErr && aiOpBrErr.message ? aiOpBrErr.message : aiOpBrErr
  );
}

// Operator Bridge — mounted first on /api/operator so /context/full and bridge routes are not shadowed.
try {
  app.use("/api/operator", operatorBridgeRouter);
  console.log(
    "[operator-bridge] v1 primary mount /api/operator (context/full, health, command/*, audit, capabilities)"
  );
} catch (bridgePrimaryErr) {
  console.warn(
    "[operator-bridge] primary mount failed:",
    bridgePrimaryErr && bridgePrimaryErr.message ? bridgePrimaryErr.message : bridgePrimaryErr
  );
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

try {
  app.use(require("./routes/cheekyOsV4.route"));
  console.log("[cheeky-v4] GET /dashboard · GET /metrics · GET /api/cheeky-os/dashboard-data (Power Apps) · POST /admin/* · GET /admin/health");
} catch (v4RouteErr) {
  console.warn(
    "[cheeky-v4] route mount skipped:",
    v4RouteErr && v4RouteErr.message ? v4RouteErr.message : v4RouteErr
  );
}

// CORS — allow external apps (Power Apps, browser clients) to call this API
const cors = require("cors");
app.use(cors());

try {
  app.use(bridgeTaskRoutes);
  console.log(
    "[agent-orchestration] v1.1 POST /api/bridge/tasks · GET pending/approved/history · approve/reject/run · JSONL queue"
  );
} catch (btErr) {
  console.warn("[agent-orchestration] bridgeTasks mount failed:", btErr && btErr.message ? btErr.message : btErr);
}

try {
  app.use("/api/approvals", approvalRoutesV5);
  console.log(
    "[v5-operational] GET /api/approvals/pending · GET /api/approvals/history · POST /api/approvals/:id/approve|reject"
  );
} catch (apErr) {
  console.warn("[v5-operational] approvals routes mount failed:", apErr && apErr.message ? apErr.message : apErr);
}

try {
  app.use(require("./routes/agentIntelV31.route"));
  console.log("[agent-intel-v31] /api/agent-intel/v31/* (additive read surfaces + keyed event append/graph seed)");
} catch (aiErr) {
  console.warn("[agent-intel-v31] mount failed:", aiErr && aiErr.message ? aiErr.message : aiErr);
}

try {
  const emailIntelligenceRoutes = require("./routes/emailIntelligence");
  const squareIntelligenceRoutes = require("./routes/squareIntelligence");
  const productionIntelligenceRoutes = require("./routes/productionIntelligence");
  const operatorQueryRoutes = require("./routes/operatorQuery");
  const dailyCommandCenterRoutes = require("./routes/dailyCommandCenter");
  app.use(emailIntelligenceRoutes);
  app.use(squareIntelligenceRoutes);
  app.use(productionIntelligenceRoutes);
  app.use(operatorQueryRoutes);
  app.use(dailyCommandCenterRoutes);
  app.use(operatorWorkflowRoutesV7);
  console.log(
    "[live-business-v4] GET /api/intelligence/* (email,square,production,daily,workflows) · POST /api/operator/query · read-only"
  );
} catch (lb4Err) {
  console.warn("[live-business-v4] mount failed:", lb4Err && lb4Err.message ? lb4Err.message : lb4Err);
}

try {
  app.use(operatorEntryRoutesV8);
  app.use(operatorDashboardRoutesV8);
  app.use(blockerDashboardRouter);
  app.use(whatNowRoutes);
  app.use(frictionLogRoutes);
  app.use(draftingRoutes);
  app.use(shiftHandoffRoutes);
  app.use(growthRoutes);
  app.use(outreachRoutes);
  app.use(kpiRoutes);
  app.use(googleAdsRoutes);
  app.use(notificationRoutes);
  app.use(reportingRoutes);
  app.use(customerRoutes);
  app.use(intakeRoutes);
  app.use(monitoringRoutes);
  app.use(dashboardViewRoutes);
  app.use(cheekyAiRoutes);
  app.use(accountingRoutes);
  app.use(reportingAdvancedRoutes);
  app.use(backupRoutes);
  app.use(teamActivityRoutes);
  app.use(workOrdersV8Router);
  app.use(garmentOrdersRoutesV8);
  app.use("/cheeky-os-ui", express.static(path.join(__dirname, "public"), { index: false }));
  console.log(
    "[cheeky-v8-entry] POST /api/operator/command · GET /api/operator/today|blocks|approvals|production-board|cash-risks · GET /api/dashboard/* · /api/workorders/* · /api/garments/* · static /cheeky-os-ui/"
  );
  console.log(
    "[cockpit-week-p1] GET /api/dashboard/blockers · GET /api/dashboard/production-cockpit · GET /api/operator/what-now · POST/GET /api/ops/friction-log"
  );
  console.log(
    "[cockpit-phase2] POST /api/drafts/generate · GET /api/drafts/pending · POST /api/drafts/consolidate-garments · POST /api/approvals/approve|reject · GET /api/ops/shift-summary"
  );
  console.log(
    "[cockpit-phase3] GET /api/growth/leads/scores · POST /api/outreach/generate · GET /api/outreach/drafts · GET /api/operator/morning-brief"
  );
  console.log(
    "[cockpit-phase4] GET /api/kpi/summary · GET /api/notifications · GET /api/reporting/exceptions · /api/growth/google-ads/* · nightly review"
  );
  console.log(
    "[cockpit-phase5] GET /api/customer/search · GET /api/customer/status · POST /api/intake/self-service · GET /api/intake/queue · GET /api/monitoring/system-health · /cheeky-os-ui/customer-intake.html"
  );
  console.log(
    "[cockpit-phase7] GET /api/dashboard/view-descriptor · POST /api/cheeky-ai/ask · GET /api/cheeky-ai/search · GET /api/accounting/* · GET /api/reporting/advanced/* · GET /api/backup/* · GET /api/team/activity · GET /api/system/full-status"
  );
} catch (v8EntryErr) {
  console.warn(
    "[cheeky-v8-entry] mount failed:",
    v8EntryErr && v8EntryErr.message ? v8EntryErr.message : v8EntryErr
  );
}

try {
  app.use(transportRoutes);
  console.log("[agent-mesh] v2 transport POST /api/transport/task · GET status · GET logs");
} catch (trErr) {
  console.warn("[agent-mesh] transport mount failed:", trErr && trErr.message ? trErr.message : trErr);
}

try {
  app.use(agentStatusRoute);
  console.log("[agent-orchestration] GET /api/agent/status");
} catch (asErr) {
  console.warn("[agent-orchestration] agentStatus mount failed:", asErr && asErr.message ? asErr.message : asErr);
}

try {
  app.use("/api/semantic-memory", memoryHttpRouter);
  console.log(
    "[semantic-memory] v1 GET /api/semantic-memory/search · /customer · /timeline · /stats · POST /api/semantic-memory/rebuild-indexes"
  );
} catch (memHttpErr) {
  console.warn("[semantic-memory] mount failed:", memHttpErr && memHttpErr.message ? memHttpErr.message : memHttpErr);
}

try {
  app.use("/api/bridge", bridgeHttpRouter);
  console.log(
    "[bridge-layer] v1 GET /api/bridge/events/recent · GET /api/bridge/customer-context · POST /api/bridge/events/test · GET /api/bridge/persistence/stats"
  );
} catch (bridgeHttpErr) {
  console.warn("[bridge-layer] mount failed:", bridgeHttpErr && bridgeHttpErr.message ? bridgeHttpErr.message : bridgeHttpErr);
}

try {
  app.use("/api/time-clock", require("./routes/timeClock.route"));
  console.log("[time-clock] /api/time-clock (clock-in, clock-out, status, today)");
} catch (tcErr) {
  console.warn("[time-clock] mount failed:", tcErr && tcErr.message ? tcErr.message : tcErr);
}
try {
  require("./routes/jeremyTasks.route").mountJeremyTasks(app);
  console.log("[jeremy] GET /api/jeremy/tasks");
} catch (jerErr) {
  console.warn("[jeremy] mount failed:", jerErr && jerErr.message ? jerErr.message : jerErr);
}

// Square Sync Layer v1 — Financial truth for Cheeky OS (additive, safe, no auto-send)
try {
  app.use("/api/square-sync", squareSyncRouter);
  console.log("[square-sync] v1 mounted at /api/square-sync (health, status, manual, reconcile, audit, webhook-test)");
} catch (syncEarlyErr) {
  console.warn("[square-sync] early mount failed:", syncEarlyErr && syncEarlyErr.message ? syncEarlyErr.message : syncEarlyErr);
}

// Production Routing Engine v1 — WHAT DO WE PRINT NEXT? (additive, safe, deposit-gated)
try {
  app.use("/api/production", productionRoutingRouter);
  console.log("[production-routing] v1 mounted at /api/production (health, queue, run, assign, jobs, tasks, audit)");
} catch (routingErr) {
  console.warn("[production-routing] v1 failed to mount:", routingErr && routingErr.message ? routingErr.message : routingErr);
}

// Activation Layer v1 — Makes the system RUN automatically (additive, thin)
try {
  app.use("/api/activation", activationRouter);
  console.log("[activation] v1 mounted at /api/activation (health, today, jeremy, task/advance, run, status)");
} catch (activationErr) {
  console.warn("[activation] v1 failed to mount:", activationErr && activationErr.message ? activationErr.message : activationErr);
}

// AI Decision Layer v1 — Snapshot + Brain endpoints (additive, read-only, fail-safe)
(function mountAICore() {
  try {
    const snapshotService = require("./services/snapshot.service");
    const aiDecision = require("./services/ai.decision.service");

    app.get("/api/cheeky/snapshot", async (req, res) => {
      try {
        const snapshot = await snapshotService.buildSnapshot();
        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, snapshot });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    app.get("/api/cheeky/brain", async (req, res) => {
      try {
        const snapshot = await snapshotService.buildSnapshot();
        const decision = aiDecision.getDailyDirective(snapshot);
        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, snapshot, decision });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    console.log("[ai-core] v1 mounted — GET /api/cheeky/snapshot · GET /api/cheeky/brain");
  } catch (aiCoreErr) {
    console.warn("[ai-core] v1 failed to mount:", aiCoreErr && aiCoreErr.message ? aiCoreErr.message : aiCoreErr);
  }
})();

(function mountDepositNudgePolicyPlaceholder() {
  try {
    const depositNudgePlaceholder = require("./services/depositNudgePlaceholder.service");
    app.get("/api/cheeky/deposit-nudge/policy", (_req, res) => {
      return res.json({
        success: true,
        ...depositNudgePlaceholder.getDepositNudgePolicySummary(),
      });
    });
    console.log("[deposit-nudge] GET /api/cheeky/deposit-nudge/policy (Phase 3 placeholder)");
  } catch (e) {
    console.warn(
      "[deposit-nudge] placeholder mount skipped:",
      e && e.message ? e.message : e
    );
  }
})();

// Cash Engine v1 — Follow-up draft generation + controlled send (additive, no auto-send)
(function mountCashEngine() {
  try {
    const followupData = require("./services/followup.data.service");
    const followupAI   = require("./services/followup.ai.service");
    const store        = require("./services/followup.store");
    const sendService  = require("./services/followup.send.service");

    // GET /api/cheeky/followups — list all drafts
    app.get("/api/cheeky/followups", (req, res) => {
      const statusFilter = req.query.status || undefined;
      const drafts = store.getDrafts(statusFilter);
      res.setHeader("Content-Type", "application/json");
      return res.json({ success: true, summary: store.getSummary(), drafts });
    });

    // POST /api/cheeky/followups/generate — find unpaid invoices + create drafts
    app.post("/api/cheeky/followups/generate", async (req, res) => {
      try {
        const body = req.body || {};
        const limit = Math.min(Number(body.limit) || 10, 50);
        const invoices = await followupData.getUnpaidInvoices(limit);
        const drafts = [];

        for (const invoice of invoices) {
          const message = followupAI.generateFollowUp(invoice);
          const draft = store.saveDraft({ ...invoice, ...message, status: "draft" });
          drafts.push(draft);
        }

        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, generated: drafts.length, drafts });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    // POST /api/cheeky/followups/send/:id — simulate send (approval required)
    app.post("/api/cheeky/followups/send/:id", async (req, res) => {
      try {
        const body = req.body || {};
        const approvedBy = body.approvedBy || "operator";
        const result = await sendService.sendDraft(req.params.id, { approvedBy });
        res.setHeader("Content-Type", "application/json");
        return res.json({ success: result.ok, result });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    // POST /api/cheeky/followups/approve/:id — approve without sending yet
    app.post("/api/cheeky/followups/approve/:id", (req, res) => {
      const body = req.body || {};
      const result = sendService.approveDraft(req.params.id, body.approvedBy || "operator");
      res.setHeader("Content-Type", "application/json");
      return res.json({ success: result.ok, ...result });
    });

    // GET /api/cheeky/followups/log — view send log (now backed by communication.log)
    app.get("/api/cheeky/followups/log", (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      return res.json({ success: true, log: sendService.getSendLog() });
    });

    // POST /api/cheeky/followups/send-all — PHASE 4: send all approved/draft emails
    app.post("/api/cheeky/followups/send-all", async (req, res) => {
      try {
        const body = req.body || {};
        const approvedBy = body.approvedBy || "operator";
        const statusFilter = body.status || "approved";  // default: only approved drafts
        const eligible = store.getDrafts(statusFilter);

        const results = [];
        for (const draft of eligible) {
          const result = await sendService.sendDraft(draft.id, { approvedBy });
          results.push({ draftId: draft.id, customerName: draft.customerName, ...result });
        }

        const sent    = results.filter((r) => r.ok).length;
        const failed  = results.filter((r) => !r.ok && r.status !== "already_sent").length;
        const skipped = results.filter((r) => r.status === "already_sent").length;

        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, sent, failed, skipped, total: results.length, results });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    // GET /api/cheeky/comms/log — PHASE 2: full communication log
    const commsLog = require("./services/communication.log");
    app.get("/api/cheeky/comms/log", (req, res) => {
      const statusFilter = req.query.status || undefined;
      const logs = commsLog.getLogs(statusFilter);
      res.setHeader("Content-Type", "application/json");
      return res.json({ success: true, summary: commsLog.getSummary(), logs });
    });

    // GET /api/cheeky/email/status — PHASE 1+5: send config + draft status summary
    const emailSvc = require("./services/email.send.service");
    app.get("/api/cheeky/email/status", (req, res) => {
      res.setHeader("Content-Type", "application/json");
      return res.json({
        success: true,
        sendMode: emailSvc.getSendMode(),
        drafts: store.getSummary(),
        comms: commsLog.getSummary(),
      });
    });

    console.log("[cash-engine] v1 mounted — /api/cheeky/followups (generate, send/:id, send-all, approve/:id, log) | /api/cheeky/comms/log | /api/cheeky/email/status");
  } catch (cashErr) {
    console.warn("[cash-engine] v1 failed to mount:", cashErr && cashErr.message ? cashErr.message : cashErr);
  }
})();

// Auto Cash System v1 — Daily runner + cash report (additive, no auto-send)
(function mountAutoCashSystem() {
  try {
    const dailyRunner   = require("./services/daily.cash.runner");
    const cashReport    = require("./services/cash.report.service");
    const store         = require("./services/followup.store");

    // GET /api/cheeky/cash/report — daily cash summary
    app.get("/api/cheeky/cash/report", async (req, res) => {
      try {
        const report = await cashReport.getCashReport();
        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, report });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    // GET /api/cheeky/cash/status — scheduler status
    app.get("/api/cheeky/cash/status", (req, res) => {
      res.setHeader("Content-Type", "application/json");
      return res.json({ success: true, scheduler: dailyRunner.getStatus(), store: store.getSummary() });
    });

    // POST /api/cheeky/cash/run — manual trigger (bypasses schedule, respects dedup)
    app.post("/api/cheeky/cash/run", async (req, res) => {
      try {
        const body = req.body || {};
        const forceRun = body.force === true;  // force=true overrides 48h cooldown
        const result = await dailyRunner.runDailyCashCheck({
          triggeredBy: body.requestedBy || "manual",
          limit: body.limit || 20,
          cooldownHours: forceRun ? 0 : 48,
        });
        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, result });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    // GET /api/cheeky/cash/history — follow-up contact history
    app.get("/api/cheeky/cash/history", (req, res) => {
      res.setHeader("Content-Type", "application/json");
      return res.json({ success: true, history: store.getAllHistory() });
    });

    // PHASE 5 — Daily Scheduler (opt-in via DAILY_SCHEDULER=true, or always-on default)
    const schedulerEnabled = process.env.DAILY_SCHEDULER !== "false";
    if (schedulerEnabled) {
      dailyRunner.start();
    } else {
      console.log("[auto-cash] DAILY_SCHEDULER=false — scheduler disabled, use POST /api/cheeky/cash/run");
    }

    console.log("[auto-cash] v1 mounted — /api/cheeky/cash (report, status, run, history) | scheduler=" + schedulerEnabled);
  } catch (autoCashErr) {
    console.warn("[auto-cash] v1 failed to mount:", autoCashErr && autoCashErr.message ? autoCashErr.message : autoCashErr);
  }
})();

// Inbound + AI reply layer v1 — log, match, draft suggestions only (no auto-reply)
(function mountInboundSystem() {
  try {
    const inboundStore = require("./services/inbound.store");
    const inboundMatch = require("./services/inbound.match.service");
    const inboundAi = require("./services/inbound.ai.reply.service");
    const opportunityDetector = require("./services/opportunity.detector");
    let commsLog = null;
    try {
      commsLog = require("./services/communication.log");
    } catch (_) {}

    app.post("/api/cheeky/inbound/email", async (req, res) => {
      try {
        const body = req.body || {};
        const saved = inboundStore.saveInbound({
          from: body.from,
          subject: body.subject,
          body: body.body,
        });

        let enriched = saved;
        try {
          const match = await inboundMatch.matchInbound(saved);
          const opportunityType = opportunityDetector.detectOpportunity(saved);
          const aiReplyDraft = await inboundAi.generateReplyDraft(saved, {
            opportunityType,
            matchedCustomerName: match.matchedCustomerName,
          });

          enriched = inboundStore.updateInbound(saved.id, {
            matchedInvoiceId: match.matchedInvoiceId,
            matchedCustomerName: match.matchedCustomerName,
            matchConfidence: match.confidence,
            orderId: match.orderId || null,
            opportunityType,
            aiReplyDraft,
            status: "processed",
          });
        } catch (innerErr) {
          console.warn("[inbound] enrich failed (message still saved):", innerErr && innerErr.message ? innerErr.message : innerErr);
        }

        if (commsLog && typeof commsLog.logMessage === "function") {
          try {
            commsLog.logMessage({
              status: "inbound",
              email: enriched.from,
              subject: enriched.subject,
              body: enriched.body,
              invoiceId: enriched.matchedInvoiceId,
              draftId: enriched.id,
              mode: "inbound_webhook",
              error: null,
            });
          } catch (_) {}
        }

        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, inbound: enriched || saved });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    app.get("/api/cheeky/inbound/review", async (req, res) => {
      try {
        const messages = inboundStore.getInboundMessages();
        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, count: messages.length, messages });
      } catch (err) {
        return res.status(500).json({ success: false, error: err && err.message ? err.message : String(err) });
      }
    });

    // AI Closer — conversion plan per inbound (review only; no auto-send / no DB writes)
    const { buildCloserReviewForMessage } = require("./services/closer.review.pack");

    app.get("/api/cheeky/closer/review", async (req, res) => {
      try {
        const messages = inboundStore.getInboundMessages();

        const reviews = messages.map((message) => buildCloserReviewForMessage(message));

        res.setHeader("Content-Type", "application/json");
        return res.json({ success: true, count: reviews.length, reviews });
      } catch (err) {
        return res.status(500).json({
          success: false,
          error: err && err.message ? err.message : String(err),
        });
      }
    });

    console.log("[inbound] v1 mounted — POST /api/cheeky/inbound/email · GET /api/cheeky/inbound/review · GET /api/cheeky/closer/review");
  } catch (inboundErr) {
    console.warn("[inbound] v1 failed to mount:", inboundErr && inboundErr.message ? inboundErr.message : inboundErr);
  }
})();

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
app.use(require("./src/routes/revenueRecovery.route"));
app.use(require("./src/routes/pricingEvaluate.route"));
app.use(require("./src/routes/flow.route"));
app.use(require("./src/routes/programs.route"));

try {
  app.use("/api/fulfillment", require("./routes/fulfillment.route"));
  console.log(
    "[fulfillment] GET /api/fulfillment/queue · POST …/pirate-ship/draft · POST …/:orderId/customer-draft"
  );
} catch (fulErr) {
  console.warn("[fulfillment] mount failed:", fulErr && fulErr.message ? fulErr.message : fulErr);
}

try {
  app.use("/api/digest", require("./routes/digest.route"));
  console.log("[digest] GET /api/digest/today · POST /api/digest/generate · GET /api/digest/history");
} catch (digErr) {
  console.warn("[digest] mount failed:", digErr && digErr.message ? digErr.message : digErr);
}

try {
  app.use("/api/purchasing", require("./routes/purchasing.route"));
  console.log(
    "[purchasing] GET /api/purchasing/plans · POST /api/purchasing/orders/:orderId/plan · PATCH approve/ordered/receive"
  );
} catch (purErr) {
  console.warn("[purchasing] mount failed:", purErr && purErr.message ? purErr.message : purErr);
}

try {
  app.use("/api/cheeky-intake", require("./routes/intakeQuote.route"));
  console.log(
    "[cheeky-intake] GET /api/cheeky-intake/health · POST /api/cheeky-intake/quote-parse (QUOTE_PENDING / PARSED)"
  );
} catch (intakeMnt) {
  console.warn(
    "[cheeky-intake] mount failed:",
    intakeMnt && intakeMnt.message ? intakeMnt.message : intakeMnt
  );
}

try {
  app.use("/api/qc", require("./routes/qc.route"));
  console.log("[qc] GET /api/qc/board · GET /api/qc/:orderId · POST /api/qc/:orderId (PASS|FAIL|OVERRIDE_PASS)");
} catch (qcMnt) {
  console.warn("[qc] mount failed:", qcMnt && qcMnt.message ? qcMnt.message : qcMnt);
}

// Power Apps orders endpoint — fulfillment PATCH routes must register before connection loop :id
try {
  app.use("/api/orders", require("./routes/orderFulfillment.route"));
  console.log("[fulfillment-order] PATCH /api/orders/:id/fulfillment · PATCH …/fulfillment/status");
} catch (foErr) {
  console.warn(
    "[fulfillment-order] mount failed:",
    foErr && foErr.message ? foErr.message : foErr
  );
}

try {
  const connectionLoopOrders = require(path.join(__dirname, "routes", "connection.loop.orders.route"));
  app.use("/api/orders", connectionLoopOrders);
  console.log("[connection-loop] GET|PATCH /api/orders/:id mounted (before powerapps list)");
} catch (err) {
  console.warn("[connection-loop] mount failed:", err && err.message ? err.message : err);
}

try {
  const ordersPowerApps = require(path.join(__dirname, "..", "src", "api", "orders.powerapps"));
  app.use("/api/orders", ordersPowerApps);
  console.log("[orders/powerapps] GET /api/orders mounted (Power Apps integration)");
} catch (err) {
  console.warn("[orders/powerapps] mount failed:", err && err.message ? err.message : err);
}

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
  console.warn("[cheeky-os] v4.3 communications mount failed:", err && err.message ? err.message : err);
}

try {
  const sendApprovalV42 = require(path.join(__dirname, "..", "..", "src", "routes", "send.approval"));
  app.use(sendApprovalV42);
} catch (err) {
  console.warn("[cheeky-os] v4.3 send approval mount failed:", err && err.message ? err.message : err);
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
try {
  app.use("/api/operator", operatorConsoleJarvis);
  console.log(
    "[jarvis-v6] POST /api/operator/ask · POST /execute · GET /jarvis/context|/context/v6 · GET /recommendations|/alerts|/focus"
  );
} catch (jarvisRouteErr) {
  console.warn("[jarvis-v6] operator console mount failed:", jarvisRouteErr && jarvisRouteErr.message ? jarvisRouteErr.message : jarvisRouteErr);
}
app.use("/api/ai", aiExecuteRouter);
app.use("/api/ai", aiContextRouter);
try {
  app.use("/api/ai", aiOperatorBrainRouter);
  console.log(
    "[ai-operator-brain] GET /api/ai/brief · POST /api/ai/command (safe drafts, no auto-send)"
  );
} catch (aiBrainErr) {
  console.warn(
    "[ai-operator-brain] mount failed:",
    aiBrainErr && aiBrainErr.message ? aiBrainErr.message : aiBrainErr
  );
}
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
app.use("/api/cashflow", cashflowApiCombined);
console.log("[cashflow] sentinel: GET /api/cashflow/snapshot · obligations · events (legacy GET /api/cashflow/)");
try {
  app.use("/api/executive", executiveBriefingJarvis);
  console.log("[jarvis-v6] GET /api/executive/daily · GET /api/executive/weekly");
} catch (execBriefErr) {
  console.warn(
    "[jarvis-v6] executive briefing mount failed:",
    execBriefErr && execBriefErr.message ? execBriefErr.message : execBriefErr
  );
}
try {
  app.use(observabilityRoutesV7);
  app.use(trustDashboardV7);
  console.log(
    "[v7-activation] GET /api/observability/traces|metrics|latency|failures|readiness · GET /api/trust/score|warnings|recommendations"
  );
} catch (v7ActErr) {
  console.warn(
    "[v7-activation] observability/trust mount failed:",
    v7ActErr && v7ActErr.message ? v7ActErr.message : v7ActErr
  );
}
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
app.use("/api/dashboard", dashboardRoutesV5);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/dashboard", dashboardNextRouter);
app.use("/api/square", squareCommandLayerRouter);
console.log(
  "[square-command-layer] /api/square/drafts, PATCH approve, POST create-square-draft, GET /order/:id/status"
);
app.use("/api/square", squareTruthRouter);
app.use("/api/square", squareDraftRouter);
app.use("/api/ops", opsTodayRouter);
app.use("/api/next", nextActionsRouter);
app.use("/api/tasks", taskAdvanceRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/inventory", inventoryHttpRouter);
app.use("/api/vendor/outbound", vendorOutboundRouter);
app.use("/api/intake", intakeRouter);
console.log(
  "[universal-intake] POST /api/intake — v3.5 branch (request_text + source + customer) → Dataverse; legacy web form unchanged"
);
console.log(
  "[cheeky-intake-brain] POST /api/intake/ai-parse { intake_id, force? } · auto-parse after new intake if CHEEKY_INTAKE_AI_AUTO_PARSE not false"
);
app.use("/api/ads", adsAnalyzeRouter);
app.use("/api/system", systemHealthRoutesV5);
app.use("/api/system", systemFullStatusRoutes);
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
      console.log("[startupValidation] warnings:", sv.warnings.slice(0, 25).join(" | "));
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
    console.warn("[BOOT WARNING] startupValidation failed:", e && e.message ? e.message : e);
  }
  try {
    await initializeSquareIntegration();
  } catch (e) {
    console.warn("[BOOT WARNING] Square init non-fatal:", e.message || e);
  }
  try {
    const startupReport = getSystemHealthReport(app);
    console.log(
      `[systemEngine] startup status=${startupReport.status} missingKeys=${startupReport.missing_keys.length} brokenRoutes=${startupReport.broken_routes.length}`
    );
  } catch (e) {
    console.warn("[BOOT WARNING] systemEngine startup scan failed:", e && e.message ? e.message : e);
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

  const skipRouteDump =
    String(process.env.CHEEKY_BOOT_ROUTE_DUMP || "").trim() === "0" ||
    (String(process.env.NODE_ENV || "").toLowerCase() === "production" &&
      !String(process.env.CHEEKY_BOOT_ROUTE_DUMP || "").match(/^(1|true|yes|on)$/i));

  if (skipRouteDump) {
    console.log("[boot] route dump skipped (NODE_ENV=production or CHEEKY_BOOT_ROUTE_DUMP=0); set CHEEKY_BOOT_ROUTE_DUMP=1 to list routes");
  }

  if (!skipRouteDump) {
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
  }

  const http = require("http");
  const httpServer = http.createServer(app);
  httpServer.listen(PORT, HOST, () => {
    let cheekyVer = "4.3.0";
    try {
      cheekyVer = require("./services/cheekyOsRuntimeConfig.service").cheekyOsVersion();
    } catch (_v) {
      /* keep default */
    }
    const statelessMode = process.env.CHEEKY_STATELESS_MODE !== "false";
    console.log(`[CHEEKY-OS v${cheekyVer}] Production Ready — Power Apps dashboard tiles + HealthSummary (degraded-safe)`);
    console.log(
      `[boot] Power Apps: connector GET /api/cheeky-os/dashboard-data — bind First(colCheekyTile).OrdersOnHold … HealthSummary (see docs/power-apps-dashboard-integration-playbook.md)`
    );
    console.log(
      `[boot] schema alignment: Prisma DB ≡ schema.prisma (run migrations from email-intake). Dataverse intake columns → CHEEKY_DV_INTAKE_* (see dvPublisherColumns.service.js).`
    );
    console.log(`✅ CHEEKY OS RUNNING ON PORT ${PORT}`);
    console.log(`Cheeky OS running on port ${PORT}`);

    try {
      const { runStaleRunningRecovery } = require("./agent/orchestrationRecovery");
      runStaleRunningRecovery();
    } catch (_rec) {}

    try {
      if (String(process.env.AGENT_PROCESSOR_ENABLED || "").trim().toLowerCase() === "true") {
        const { startProcessor } = require("./agent/taskProcessor");
        startProcessor(Number(process.env.AGENT_PROCESSOR_INTERVAL_MS || 30000));
      } else {
        console.log("[agent-processor] disabled (AGENT_PROCESSOR_ENABLED is not true)");
      }
    } catch (apErr) {
      console.warn("[agent-processor] failed to start:", apErr && apErr.message ? apErr.message : apErr);
    }

    startSelfFixSystem();
    console.log(`[boot] phase=listen ok=1 url=http://${HOST}:${PORT}`);
    console.log(`[cheeky-os] listening on http://${HOST}:${PORT}`);
    try {
      const { startDailyDigestScheduler } = require("./services/dailyDigestScheduler.service");
      startDailyDigestScheduler();
    } catch (dsch) {
      console.warn("[digest-scheduler] failed to start:", dsch && dsch.message ? dsch.message : dsch);
    }
    try {
      const { installGracefulShutdown } = require("./services/cheekyOsShutdown.service");
      installGracefulShutdown(httpServer);
    } catch (sdErr) {
      console.warn("[shutdown] graceful handlers not installed:", sdErr && sdErr.message ? sdErr.message : sdErr);
    }

    try {
      const { startCheekyOsAlertTicker } = require("./services/cheekyOsAlerts.service");
      startCheekyOsAlertTicker();
    } catch (alErr) {
      console.warn("[alert-ticker]", alErr && alErr.message ? alErr.message : alErr);
    }

    try {
      const { startOperatorAutonomousWorker } = require("./services/operatorAutonomousWorker.service");
      startOperatorAutonomousWorker();
    } catch (wk) {
      console.warn("[operator-worker] start failed:", wk && wk.message ? wk.message : String(wk));
    }

    /** v4 canonical boot line (Patrick-facing) — uses actual listen PORT */
    try {
      const runtimeObs = require("./services/cheekyOsRuntimeObservability.service");
      const snapshot = runtimeObs.getObservabilitySnapshot();
      const ww = snapshot.worker || {};
      const dashUrl = `http://localhost:${PORT}/dashboard`;
      const workerPhrase = !ww.enabled
        ? "idle (WORKER_ENABLED=false)"
        : !ww.running
          ? "stopped"
          : ww.breakerOpenUntil && Date.now() < ww.breakerOpenUntil
            ? "recovering (circuit breaker)"
            : "running";
      console.log(
        `🎉 CHEEKY OS v${cheekyVer} FULLY UNLOCKED & AUTONOMOUS 🚀 Operator Worker ${workerPhrase} | HTML /dashboard | Power Apps GET /api/cheeky-os/dashboard-data | ${dashUrl}`
      );
    } catch (_) {
      console.log(
        `🎉 CHEEKY OS v${cheekyVer} FULLY UNLOCKED & AUTONOMOUS 🚀 HTML /dashboard · Power Apps tiles /api/cheeky-os/dashboard-data · http://localhost:${PORT}/dashboard`
      );
    }

    const probeDelayMs = Number(process.env.CHEEKY_OS_INTAKE_SELFTEST_DELAY_MS || "2800") || 2800;
    setTimeout(() => {
      try {
        const { logIntakeV31StartupProbe } = require("./services/intakeFlowHealth.service");
        const localBase = `http://127.0.0.1:${PORT}`;
        Promise.resolve(logIntakeV31StartupProbe(localBase)).catch(() => {});
      } catch (_) {
        console.warn("[BOOT WARNING] intake self-test module unavailable; continuing partial boot");
      }
    }, probeDelayMs);

    console.log(`[cheeky-os] health: http://127.0.0.1:${PORT}/health`);
    console.log(`[cheeky-os] system/health: http://127.0.0.1:${PORT}/system/health`);
    console.log(`[cheeky-os] system check: GET http://127.0.0.1:${PORT}/system/check`);
    console.log(
      `[cheeky-os] control tower: GET /control-tower (HTML) · operator dashboard: GET /dashboard · command POST /command`
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

    try {
      const obs = require(path.join(__dirname, "services", "cheekyOsRuntimeObservability.service"));
      obs.registerCron("activation_production_engine", "every 10 min", 10 * 60 * 1000);
      obs.registerCron("followup_email", "hourly when ENABLE_FOLLOWUP_ENGINE=true", 3600000);
      obs.registerCron("sales_opportunity_scan", "every 10 min", 10 * 60 * 1000);
      obs.registerCron("dashboard_summary_cache", "every 20 min", 20 * 60 * 1000);
      obs.registerCron("dead_lead_recovery", "weekly (7d placeholder)", 7 * 24 * 3600000);
      obs.registerCron("outreach_loop_weekdays", "daily (24h placeholder; drafts approval-gated)", 24 * 3600000);
    } catch (_cronReg) {}

    // Activation Layer — auto-runner (every 10 min, deposit-gated, no auto-send)
    try {
      activationRunner.start();
      console.log(`[activation] auto-runner started — /api/activation/today · /api/activation/jeremy`);
    } catch (activationStartErr) {
      console.warn("[activation] runner failed to start:", activationStartErr && activationStartErr.message ? activationStartErr.message : activationStartErr);
    }

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
          const obs = require(path.join(__dirname, "services", "cheekyOsRuntimeObservability.service"));
          setInterval(() => {
            try {
              obs.noteCronRun("followup_email");
            } catch (_n) {}
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
        const salesScanEng = require(path.join(__dirname, "services", "salesOpportunityEngine.service"));
        const obs = require(path.join(__dirname, "services", "cheekyOsRuntimeObservability.service"));
        setInterval(() => {
          try {
            obs.noteCronRun("sales_opportunity_scan");
          } catch (_n) {}
          salesScanEng.maybeRunDailySalesScan().catch((err) =>
            console.warn("[sales-scan]", err && err.message ? err.message : err)
          );
        }, 10 * 60 * 1000);
        console.log(
          "[sales-engine] daily opportunity scan hook (CHEEKY_SALES_SCAN_ENABLED=false default; hour=CHEEKY_SALES_SCAN_HOUR; CHEEKY_SALES_AUTO_DRAFT=false default)"
        );
      } catch (salesSchErr) {
        console.warn("[sales-engine] scan hook not started:", salesSchErr && salesSchErr.message ? salesSchErr.message : salesSchErr);
      }
    }

    if (!statelessMode) {
      try {
        const obs = require(path.join(__dirname, "services", "cheekyOsRuntimeObservability.service"));
        const dashSum = require(path.join(__dirname, "services", "dashboardSummaryService"));
        setInterval(() => {
          try {
            obs.noteCronRun("dashboard_summary_cache");
          } catch (_n) {}
          dashSum.buildDashboardSummary().catch((err) =>
            console.warn("[dashboard-summary-cron]", err && err.message ? err.message : err)
          );
        }, 20 * 60 * 1000);
      } catch (_dashCron) {}
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
