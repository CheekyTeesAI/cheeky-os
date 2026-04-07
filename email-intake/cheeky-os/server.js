/**
 * Cheeky OS — Bundle 1 standalone HTTP server (mobile + revenue routes).
 * Listen on 0.0.0.0:3001. Run from repo: `node cheeky-os/server.js` (cwd: email-intake).
 *
 * Does not modify the main TypeScript API (voice.run); use this process for LAN/mobile tests.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const express = require("express");
const { initializeSquareIntegration } = require("./integrations/square");
const cheekyRouter = require("./routes");
const revenueRouter = require("./routes/revenue");
const mobileDashboardRouter = require("./routes/mobileDashboard");
const dashboardNextRouter = require("./routes/dashboardNext");
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
const notificationsRouter = require("./routes/notifications");
const appCenterRouter = require("./routes/appCenter");
const runbookRouter = require("./routes/runbook");
const autopilotRouter = require("./routes/autopilot");
const pricingRouter = require("./routes/pricing");
const { router: responsesRouter } = require("./routes/responses");
const { router: cashRouter } = require("./routes/cash");
const { router: exceptionsRouter } = require("./routes/exceptions");
const { router: ledgerRouter } = require("./routes/ledger");
const { router: scorecardRouter } = require("./routes/scorecard");

/** Bundle 1 requires 3001; override with CHEEKY_OS_PORT only (not generic PORT). */
const PORT = Number(process.env.CHEEKY_OS_PORT || 3001);
const HOST = "0.0.0.0";

const app = express();

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cheeky-os",
    port: PORT,
    time: new Date().toISOString(),
  });
});

app.get("/system/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "cheeky-os",
    port: PORT,
    time: new Date().toISOString(),
  });
});

/** Bundle 19 — GET /system/check (keep after /system/health so health stays exact match). */
app.use("/system", systemCheckRouter);

app.use(express.json());

app.use("/cheeky", cheekyRouter);
app.use("/revenue", revenueRouter);
app.use("/dashboard", dashboardNextRouter);
app.use("/square", squareDraftRouter);
app.use("/sales", salesRouter);
app.use("/capture", captureRouter);
app.use("/orders", ordersCaptureRouter);
app.use("/orders", ordersStatusRouter);
app.use("/orders", ordersMemoryRouter);
app.use("/orders", ordersIntelligenceRouter);
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
app.use("/exceptions", exceptionsRouter);
app.use("/ledger", ledgerRouter);
app.use(scorecardRouter);
app.use(appCenterRouter);
app.use("/", mobileDashboardRouter);

app.use((err, req, res, _next) => {
  console.error("[cheeky-os/server]", req.method, req.url, err.message || err);
  res.status(500).json({ ok: false, error: err.message || "error" });
});

async function main() {
  try {
    await initializeSquareIntegration();
  } catch (e) {
    console.warn("[cheeky-os/server] Square init non-fatal:", e.message || e);
  }

  app.listen(PORT, HOST, () => {
    console.log(`[cheeky-os] listening on http://${HOST}:${PORT}`);
    console.log(`[cheeky-os] health: http://127.0.0.1:${PORT}/health`);
    console.log(`[cheeky-os] system/health: http://127.0.0.1:${PORT}/system/health`);
    console.log(`[cheeky-os] system check: GET http://127.0.0.1:${PORT}/system/check`);
    console.log(
      `[cheeky-os] system automation: GET http://127.0.0.1:${PORT}/system/status · POST /system/start · POST /system/stop`
    );
    console.log(`[cheeky-os] reactivation: http://127.0.0.1:${PORT}/revenue/reactivation`);
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
      `[cheeky-os] orders add-note: POST http://127.0.0.1:${PORT}/orders/add-note`
    );
    console.log(
      `[cheeky-os] orders add-decision: POST http://127.0.0.1:${PORT}/orders/add-decision`
    );
    console.log(
      `[cheeky-os] orders intelligence: GET http://127.0.0.1:${PORT}/orders/intelligence/:orderId`
    );
    console.log(`[cheeky-os] legacy mount: http://127.0.0.1:${PORT}/cheeky/health`);
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[cheeky-os/server] fatal:", err);
    process.exit(1);
  });
}

module.exports = { app, main };
