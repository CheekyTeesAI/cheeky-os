"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const path_1 = __importDefault(require("path"));
const node_cron_1 = __importDefault(require("node-cron"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runFollowUpCycle } = require("../../lib/followUpEngine");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require("nodemailer");
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const zod_1 = require("zod");
const brain_1 = require("../core/brain");
const gatekeeper_1 = require("../core/gatekeeper");
const router_1 = require("../core/router");
const store_1 = require("../debug/store");
const config_1 = require("../utils/config");
const safety_1 = require("../utils/safety");
const logger_1 = require("../utils/logger");
const errorHandler_1 = require("../middleware/errorHandler");
const errors_1 = require("../utils/errors");
const health_1 = __importDefault(require("./health"));
const test_email_1 = __importDefault(require("./test.email"));
const debug_last_1 = __importDefault(require("./debug.last"));
const debug_replay_1 = __importDefault(require("./debug.replay"));
const orders_list_1 = __importDefault(require("./orders.list"));
const orders_create_1 = require("./orders.create");
const email_intake_1 = require("./email.intake");
const quote_generate_1 = require("./quote.generate");
const invoice_create_1 = require("./invoice.create");
const pipeline_run_1 = require("./pipeline.run");
const ai_intake_1 = require("./ai.intake");
const orders_board_1 = __importDefault(require("./orders.board"));
const orders_move_1 = __importDefault(require("./orders.move"));
const orders_update_1 = __importDefault(require("./orders.update"));
const orders_priority_1 = __importDefault(require("./orders.priority"));
const webhooks_square_1 = __importDefault(require("./webhooks.square"));
const system_url_1 = __importDefault(require("./system.url"));
const dashboard_1 = __importDefault(require("./dashboard"));
const orderIntake_1 = __importDefault(require("../routes/orderIntake"));
const orderDraftInvoice_1 = __importDefault(require("../routes/orderDraftInvoice"));
const orderPublishInvoice_1 = __importDefault(require("../routes/orderPublishInvoice"));
const orderProductionRouting_1 = __importDefault(require("../routes/orderProductionRouting"));
const orderGarments_1 = __importDefault(require("../routes/orderGarments"));
const orderDigitizing_1 = __importDefault(require("../routes/orderDigitizing"));
const manualReview_1 = __importDefault(require("../routes/manualReview"));
const dashboardToday_1 = __importDefault(require("../routes/dashboardToday"));
const dashboardTodayActions_1 = __importDefault(require("../routes/dashboardTodayActions"));
const emailIntake_1 = __importDefault(require("../routes/emailIntake"));
const email_intake_ai_1 = __importDefault(require("../routes/email.intake.ai"));
const dashboard_2 = __importDefault(require("../routes/dashboard"));
const actions_1 = __importDefault(require("../routes/actions"));
const outlookIntakeWebhook_1 = __importDefault(require("../routes/outlookIntakeWebhook"));
const systemHealth_1 = __importDefault(require("../routes/systemHealth"));
const squareWebhook_1 = __importDefault(require("../routes/squareWebhook"));
const square_webhook_1 = __importDefault(require("../routes/square.webhook"));
const intake_engine_1 = require("../engines/intake.engine");
// TEMP stability: re-enable with background jobs in app.listen callback
// import { startFollowupJob } from "../jobs/followup.job";
// import { runUnpaidFollowup } from "../jobs/unpaidFollowup.job";
const followup_engine_1 = require("../jobs/followup.engine");
const followUpJob_1 = require("../jobs/followUpJob");
const reactivation_engine_1 = require("../jobs/reactivation.engine");
const reviveQuotes_1 = require("../services/reviveQuotes");
const paymentCloseEngine_1 = require("../services/paymentCloseEngine");
const auth_1 = require("../middleware/auth");
const client_1 = require("../db/client");
const index_1 = require("../index");
const operatorRouter_1 = __importDefault(require("../operator/operatorRouter"));
const operatorLayer_1 = __importDefault(require("../routes/operatorLayer"));
const commandLayer_routes_1 = __importDefault(require("../modules/command-layer/routes/commandLayer.routes"));
const intake_route_1 = __importDefault(require("./intake.route"));
const tasks_route_1 = __importDefault(require("./tasks.route"));
const payment_route_1 = __importDefault(require("./payment.route"));
const orders_route_1 = __importDefault(require("./orders.route"));
const followups_run_route_1 = __importDefault(require("./followups.run.route"));
const followups_route_1 = __importDefault(require("./followups.route"));
const dashboard_route_1 = __importDefault(require("./dashboard.route"));
const scheduler_service_1 = require("../modules/command-layer/services/scheduler.service");
// Prevent runaway memory in dev
process.setMaxListeners(20);
// Social OS + /social routes share this Prisma instance (see social/lib/db.js).
globalThis.__CHEEKY_PRISMA_SINGLETON__ =
    client_1.db;
console.log("ENV API KEY:", process.env.API_KEY);
console.log("🚀 SERVER ENTRY LOADED");
const bodySchema = zod_1.z.object({
    text: zod_1.z.string().min(1),
    inputType: zod_1.z.enum(["manual", "email"]).optional().default("manual"),
    notifyEmail: zod_1.z.string().email().optional()
});
const app = (0, express_1.default)();
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
app.get("/system/check", (_req, res) => {
    res.json({
        success: true,
        server: "running",
        timestamp: new Date().toISOString()
    });
});
// Command-layer scheduler (hourly event check + daily war room): off unless ENABLE_SCHEDULER=true
if (process.env.ENABLE_SCHEDULER === "true") {
    try {
        (0, scheduler_service_1.startScheduler)();
        logger_1.logger.info("Command-layer scheduler started (ENABLE_SCHEDULER=true)");
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error(`Command-layer scheduler failed to start: ${message}`);
    }
}
else {
    logger_1.logger.info("Command-layer scheduler disabled (set ENABLE_SCHEDULER=true to enable hourly/daily jobs)");
}
app.use((req, res, next) => {
    console.log(`📡 INCOMING: ${req.method} ${req.url}`);
    next();
});
// --- Square webhook mounts (canonical + legacy) ---
// CANONICAL production contract (raw body BEFORE express.json; HMAC-safe):
//   POST /api/square/webhook → squareApiWebhookRouter (routes/squareWebhook.ts).
//   Use this URL in Square Developer Dashboard for full invoice/payment pipeline.
// Legacy / compatibility (do not remove; not interchangeable with canonical):
//   POST /cheeky/webhooks/square → webhooks.square.ts (legacy pipeline; differs from canonical)
//   POST /webhooks/square       → square.webhook.ts (JSON; payment.completed → handleSquarePaymentWebhook only)
// Note: cheeky-os production also exposes POST /webhooks/square/webhook as a mirror of canonical (see src/webhooks/squareWebhook.js); voice.run does not mount that path.
console.log("[boot] squareWebhook=canonical POST /api/square/webhook | legacy POST /cheeky/webhooks/square | compat POST /webhooks/square (payment JSON)");
app.use("/cheeky/webhooks/square", express_1.default.raw({ type: "application/json" }), webhooks_square_1.default);
app.use("/api/square/webhook", express_1.default.raw({ type: "application/json", limit: "2mb" }), squareWebhook_1.default);
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(process.cwd(), "public")));
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)());
app.use(systemHealth_1.default);
app.use(dashboard_2.default);
app.use(actions_1.default);
app.use("/operator", operatorLayer_1.default);
app.use(orderIntake_1.default);
app.use(emailIntake_1.default);
app.use(email_intake_ai_1.default);
app.use(outlookIntakeWebhook_1.default);
// Canonical POST /api/square/webhook is mounted above with express.raw (byte-exact HMAC).
// Legacy storefront payment hook: POST /webhooks/square (see routes/square.webhook.ts)
app.use(square_webhook_1.default);
app.use("/cheeky/system/url", system_url_1.default);
// Unified command layer (isolated JS module — parse → route → actions → memory)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use("/api/command", require("../../routes/command"));
// Public webhook-friendly intake → parse + auto intake (estimate + notify email)
app.use("/intake", intake_route_1.default);
// Production task queue (in-memory v1)
app.use("/tasks", tasks_route_1.default);
// Payment → production (public hook for deposits / Square-style payloads)
app.use("/payment", payment_route_1.default);
app.use("/orders", orders_route_1.default);
app.use("/followups/run", followups_run_route_1.default);
app.use("/followups", followups_route_1.default);
app.use("/dashboard", dashboard_route_1.default);
// Cash Command Center (GET /api/cash/command-center, /api/cash/brief — read-only + draft queue;
// same router as cheeky-os/server.js)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../../cheeky-os/src/routes/cash.route"));
// Sales Engine v1 (GET /api/sales/pipeline, /api/sales/today — draft + priority only)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use("/api/sales", require("../../cheeky-os/routes/sales"));
// Operator summary + brief (incl. sales snapshot for /api/operator/brief)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../../cheeky-os/src/routes/operator.route"));
// Revenue recovery v1 (GET /api/followups/today)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../../cheeky-os/src/routes/revenueRecovery.route"));
// Profit engine v1 (POST /api/pricing/evaluate)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../../cheeky-os/src/routes/pricingEvaluate.route"));
// Comms routes incl. GET /api/comms/queue + PATCH /api/comms/:id (recovery queue)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use("/api/comms", require("../../cheeky-os/routes/comms"));
// GLOBAL AUTH
app.use(auth_1.requireApiKey);
// Outreach close loop (new modules only — see src/routes/outreach.close.js)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/outreach.close"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/outreach.send"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/outreach.workflow"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/outreach.daily"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/outreach.followup"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/ops.status"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/revenue.command"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/founder.dashboard"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/revenue.reply-log"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/revenue.history"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/customers.quick-add"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/outreach.recovery"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/reactivation.system"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/revenue.intel"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../routes/operator.go"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use(require("../../social/routes/social"));
(0, index_1.registerJarvisApi)(app);
app.use("/operator", operatorRouter_1.default);
app.use("/api/command", commandLayer_routes_1.default);
// PROTECTED ROUTES
app.use("/cheeky", health_1.default);
app.use(test_email_1.default);
app.use(debug_last_1.default);
app.use(debug_replay_1.default);
app.use(orders_list_1.default);
app.use(orders_board_1.default);
app.use(orders_move_1.default);
app.use(orders_update_1.default);
app.use(orders_priority_1.default);
app.use(dashboard_1.default);
app.use(orderDraftInvoice_1.default);
app.use(orderPublishInvoice_1.default);
app.use(orderProductionRouting_1.default);
app.use(orderGarments_1.default);
app.use(orderDigitizing_1.default);
app.use(manualReview_1.default);
app.use(dashboardToday_1.default);
app.use(dashboardTodayActions_1.default);
app.post("/cheeky/orders/create", orders_create_1.createOrder);
app.post("/cheeky/email-intake", email_intake_1.emailIntake);
app.post("/cheeky/quote/generate", quote_generate_1.generateQuote);
app.post("/cheeky/invoice/create", invoice_create_1.createInvoice);
app.post("/cheeky/pipeline/run", pipeline_run_1.runPipeline);
app.post("/cheeky/ai/intake", ai_intake_1.aiIntake);
app.get("/cheeky/followup/run", followup_engine_1.runFollowupEngine);
app.get("/cheeky/reactivation/run", reactivation_engine_1.runReactivationEngine);
app.post("/cheeky/voice/run", async (req, res) => {
    let pipelineInput;
    try {
        logger_1.logger.info("STEP 1: request received");
        const provided = (0, auth_1.readProvidedApiKey)(req);
        const expected = (0, auth_1.readExpectedApiKey)();
        if (!provided || provided !== expected) {
            const out = (0, errors_1.errorResponse)("STEP 2", "Invalid API key");
            res.status(401).json(out);
            return;
        }
        logger_1.logger.info("STEP 2: api key validated");
        if (safety_1.SAFETY.SYSTEM_DISABLED) {
            const out = (0, errors_1.errorResponse)("STEP 3", "System disabled");
            res.status(503).json(out);
            return;
        }
        logger_1.logger.info("STEP 3: safety gate passed");
        const parsed = bodySchema.safeParse(req.body);
        if (!parsed.success) {
            const out = (0, errors_1.errorResponse)("STEP 4", "Invalid request body");
            res.status(400).json(out);
            return;
        }
        logger_1.logger.info("STEP 4: body parsed");
        const { text, inputType, notifyEmail } = parsed.data;
        pipelineInput = text;
        if (inputType === "email") {
            const notifyTo = notifyEmail?.trim() ||
                (process.env.INTAKE_NOTIFY_EMAIL || "").trim() ||
                "";
            if (!notifyTo) {
                const out = (0, errors_1.errorResponse)("INTAKE", "notifyEmail or INTAKE_NOTIFY_EMAIL required for inputType email");
                (0, store_1.setLastRun)({ input: text, output: out, timestamp: Date.now() });
                res.status(400).json(out);
                return;
            }
            logger_1.logger.info("STEP 5: intake (email path)");
            logger_1.stepLog.brain("(email → intake.engine)");
            const routed = await (0, intake_engine_1.runIntakeFromEmailText)(text, notifyTo);
            logger_1.stepLog.engine(`intake invoiceId=${routed.invoiceId} status=${routed.status}`);
            (0, store_1.setLastRun)({ input: text, output: routed, timestamp: Date.now() });
            logger_1.logger.info("STEP 6: intake + email completed");
            res.json(routed);
            return;
        }
        const brainOut = await (0, brain_1.brain)(text);
        logger_1.stepLog.brain(`intent=${brainOut.intent} confidence=${brainOut.confidence} customer=${brainOut.customerName}`);
        logger_1.logger.info("STEP 5: brain executed");
        const gk = (0, gatekeeper_1.gatekeeper)(brainOut);
        if (gk.ok === false) {
            logger_1.stepLog.gatekeeper(`blocked: ${gk.error}`);
            const out = {
                ok: false,
                success: false,
                stage: gk.stage,
                error: gk.error
            };
            (0, store_1.setLastRun)({ input: text, output: out, timestamp: Date.now() });
            res.status(400).json(out);
            return;
        }
        logger_1.stepLog.gatekeeper("passed validation");
        logger_1.stepLog.router("dispatch CREATE_INVOICE → sales.engine");
        const routed = await (0, router_1.route)(brainOut.intent, gk.payload);
        logger_1.stepLog.engine(`invoiceId=${routed.invoiceId} status=${routed.status}`);
        logger_1.logger.info("STEP 6: router completed");
        const out = {
            ...routed,
            confidence: brainOut.confidence
        };
        (0, store_1.setLastRun)({ input: text, output: out, timestamp: Date.now() });
        res.json(out);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const out = (0, errors_1.errorResponse)("PIPELINE", message);
        if (pipelineInput !== undefined) {
            (0, store_1.setLastRun)({ input: pipelineInput, output: out, timestamp: Date.now() });
        }
        res.status(500).json(out);
    }
});
app.use(errorHandler_1.errorHandler);
try {
    app.listen(config_1.config.port, () => {
        if (!process.env.POWER_AUTOMATE_OUTLOOK_WEBHOOK) {
            console.warn("⚠️ Outlook webhook not configured — running in stub mode");
        }
        console.log(`🚀 Server running on port ${config_1.config.port}`);
        console.log(`Server running on port ${config_1.config.port}`);
        logger_1.logger.info(`Server running on port ${config_1.config.port}`);
        node_cron_1.default.schedule("*/30 * * * *", async () => {
            console.log("--- FOLLOW-UP CYCLE START ---");
            try {
                const result = await runFollowUpCycle();
                console.log("Follow-up result:", result);
            }
            catch (err) {
                console.error("Follow-up error:", err instanceof Error ? err.message : err);
            }
            console.log("--- FOLLOW-UP CYCLE END ---");
        });
        setInterval(() => {
            try {
                void (0, followUpJob_1.runFollowUpJob)();
            }
            catch (err) {
                console.error("[followUpJob] cron:", err instanceof Error ? err.message : err);
            }
        }, 30 * 60 * 1000);
        (0, reviveQuotes_1.registerQuoteRevivalInterval)();
        (0, paymentCloseEngine_1.registerPaymentCloseInterval)();
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const revenueScheduler = require("../automation/scheduler");
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const envValidator = require("../utils/envValidator");
            envValidator.printEnvWarnings();
            revenueScheduler.logRevenueEngineOnline();
            if (process.env.DAILY_SCHEDULER === "true") {
                revenueScheduler.startDailyScheduler({ port: config_1.config.port });
            }
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const socialCron = require("../../social/cron/jobs");
            socialCron.register();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error("Revenue engine startup hook failed:", message);
        }
        setTimeout(async () => {
            try {
                const apiKey = encodeURIComponent((process.env.API_KEY || "").trim());
                if (process.env.AUTO_RUN_COMMAND === "true") {
                    console.log("\n🚀 AUTO RUN: revenue.command (AUTO_RUN_COMMAND)\n");
                    const res = await fetch(`http://127.0.0.1:${config_1.config.port}/revenue/command?apikey=${apiKey}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({})
                    });
                    const data = await res.json();
                    if (data && data.success === false) {
                        console.error("\n⚠️ AUTO RUN COMMAND FINISHED WITH ERRORS\n", data);
                    }
                    else {
                        console.log("\n✅ AUTO RUN COMMAND COMPLETE\n", data);
                    }
                }
                else if (process.env.AUTO_DAILY_RUN === "true") {
                    console.log("\n🚀 AUTO RUN: revenue.command\n");
                    const res = await fetch(`http://127.0.0.1:${config_1.config.port}/revenue/command?apikey=${apiKey}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({})
                    });
                    const data = await res.json();
                    if (data && data.success === false) {
                        console.error("\n⚠️ AUTO REVENUE COMMAND FINISHED WITH ERRORS\n", data);
                    }
                    else {
                        console.log("\n✅ AUTO REVENUE COMMAND COMPLETE\n", data);
                    }
                }
                else {
                    console.log("\n🚀 AUTO RUN: outreach.close\n");
                    const res = await fetch(`http://127.0.0.1:${config_1.config.port}/outreach/close?apikey=${apiKey}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({})
                    });
                    const data = await res.json();
                    console.log("\n✅ AUTO RUN COMPLETE\n", data);
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error("AUTO RUN ERROR:", message);
            }
        }, 2000);
        setTimeout(async () => {
            try {
                console.log("\n📧 SENDING TEST EMAIL...\n");
                const transporter = nodemailer.createTransport({
                    host: "smtp.office365.com",
                    port: 587,
                    secure: false,
                    auth: {
                        user: process.env.OUTREACH_EMAIL,
                        pass: process.env.OUTREACH_PASSWORD
                    }
                });
                console.log("EMAIL CONFIG:", {
                    user: process.env.OUTREACH_EMAIL,
                    hasPassword: !!process.env.OUTREACH_PASSWORD
                });
                await new Promise((resolve, reject) => {
                    transporter.verify((error) => {
                        if (error) {
                            console.error("❌ EMAIL SERVER FAILED:", error.message);
                            reject(error);
                        }
                        else {
                            console.log("✅ EMAIL SERVER READY");
                            resolve();
                        }
                    });
                });
                await transporter.sendMail({
                    from: `"Cheeky Tees Test" <${process.env.OUTREACH_EMAIL}>`,
                    to: process.env.OUTREACH_EMAIL,
                    subject: "Cheeky OS Test Email",
                    text: "If you received this, your email system is working."
                });
                console.log("✅ TEST EMAIL SENT\n");
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error("❌ EMAIL FAILED:", message);
            }
        }, 3000);
        // TEMP stability: defer background follow-up jobs — re-enable after boot is stable
        // DAILY FOLLOW-UP SCHEDULER (every day at 9 AM)
        // setInterval(async () => {
        //   try {
        //     console.log("AUTO FOLLOW-UP RUNNING...");
        //
        //     await runFollowupEngine(
        //       {} as any,
        //       {
        //         json: (data: any) => console.log("AUTO FOLLOW-UP RESULT:", data),
        //         status: () => ({ json: (data: any) => console.log("AUTO ERROR:", data) })
        //       } as any
        //     );
        //
        //   } catch (err) {
        //     console.error("AUTO FOLLOW-UP FAILED:", err);
        //   }
        // }, 1000 * 60 * 60 * 24); // every 24 hours
        //
        // startFollowupJob();
        // // Follow up on unpaid orders every hour.
        // setInterval(() => {
        //   void runUnpaidFollowup();
        // }, 60 * 60 * 1000);
    });
}
catch (err) {
    console.error("SERVER FAILED TO START", err);
}
