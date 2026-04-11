import 'dotenv/config';
import path from "path";
import cron from "node-cron";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runFollowUpCycle } = require("../../lib/followUpEngine");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require("nodemailer");
import express, { Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import { z } from "zod";
import { brain } from "../core/brain";
import { gatekeeper } from "../core/gatekeeper";
import { route } from "../core/router";
import { setLastRun } from "../debug/store";
import { config } from "../utils/config";
import { SAFETY } from "../utils/safety";
import { logger, stepLog } from "../utils/logger";
import { errorHandler } from "../middleware/errorHandler";
import { errorResponse } from "../utils/errors";
import healthRouter from "./health";
import testEmailRouter from "./test.email";
import debugLastRouter from "./debug.last";
import debugReplayRouter from "./debug.replay";
import ordersListRouter from "./orders.list";
import { createOrder } from "./orders.create";
import { emailIntake } from "./email.intake";
import { generateQuote } from "./quote.generate";
import { createInvoice } from "./invoice.create";
import { runPipeline } from "./pipeline.run";
import { aiIntake } from "./ai.intake";
import ordersBoardRouter from "./orders.board";
import ordersMoveRouter from "./orders.move";
import ordersUpdateRouter from "./orders.update";
import ordersPriorityRouter from "./orders.priority";
import squareWebhookRouter from "./webhooks.square";
import systemUrlRouter from "./system.url";
import cheekyDbDashboardRouter from "./dashboard";
import orderIntakeRouter from "../routes/orderIntake";
import orderDraftInvoiceRouter from "../routes/orderDraftInvoice";
import orderPublishInvoiceRouter from "../routes/orderPublishInvoice";
import orderProductionRoutingRouter from "../routes/orderProductionRouting";
import orderGarmentsRouter from "../routes/orderGarments";
import orderDigitizingRouter from "../routes/orderDigitizing";
import manualReviewRouter from "../routes/manualReview";
import dashboardTodayRouter from "../routes/dashboardToday";
import dashboardTodayActionsRouter from "../routes/dashboardTodayActions";
import emailIntakeRouter from "../routes/emailIntake";
import emailIntakeAiRouter from "../routes/email.intake.ai";
import dashboardOpsRouter from "../routes/dashboard";
import actionsRouter from "../routes/actions";
import outlookIntakeWebhookRouter from "../routes/outlookIntakeWebhook";
import systemHealthRouter from "../routes/systemHealth";
import squareApiWebhookRouter from "../routes/squareWebhook";
import squarePaymentWebhookRouter from "../routes/square.webhook";
import { runIntakeFromEmailText } from "../engines/intake.engine";
// TEMP stability: re-enable with background jobs in app.listen callback
// import { startFollowupJob } from "../jobs/followup.job";
// import { runUnpaidFollowup } from "../jobs/unpaidFollowup.job";
import { runFollowupEngine } from "../jobs/followup.engine";
import { runFollowUpJob } from "../jobs/followUpJob";
import { runReactivationEngine } from "../jobs/reactivation.engine";
import { registerQuoteRevivalInterval } from "../services/reviveQuotes";
import { registerPaymentCloseInterval } from "../services/paymentCloseEngine";
import {
  requireApiKey,
  readProvidedApiKey,
  readExpectedApiKey
} from "../middleware/auth";
import { db } from "../db/client";
import { registerJarvisApi } from "../index";
import operatorRouter from "../operator/operatorRouter";
import operatorLayerRouter from "../routes/operatorLayer";
import commandLayerRoutes from "../modules/command-layer/routes/commandLayer.routes";
import intakeRouter from "./intake.route";
import tasksRouter from "./tasks.route";
import paymentRouter from "./payment.route";
import ordersRouter from "./orders.route";
import followUpsRunRouter from "./followups.run.route";
import followUpsRouter from "./followups.route";
import dashboardRouter from "./dashboard.route";
// TEMP stability: see startScheduler() call below
// import { startScheduler } from "../modules/command-layer/services/scheduler.service";

// Prevent runaway memory in dev
process.setMaxListeners(20);

// Social OS + /social routes share this Prisma instance (see social/lib/db.js).
(globalThis as typeof globalThis & { __CHEEKY_PRISMA_SINGLETON__?: typeof db }).__CHEEKY_PRISMA_SINGLETON__ =
  db;
console.log("ENV API KEY:", process.env.API_KEY);
console.log("🚀 SERVER ENTRY LOADED");

const bodySchema = z.object({
  text: z.string().min(1),
  inputType: z.enum(["manual", "email"]).optional().default("manual"),
  notifyEmail: z.string().email().optional()
});

const app = express();

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/system/check", (_req: Request, res: Response) => {
  res.json({
    success: true,
    server: "running",
    timestamp: new Date().toISOString()
  });
});

// TEMP stability: defer command-layer scheduler (hourly/daily jobs) — re-enable after boot is stable
// startScheduler();
app.use((req, res, next) => {
  console.log(`📡 INCOMING: ${req.method} ${req.url}`);
  next();
});
console.log("🔥 MOUNTING SQUARE WEBHOOK ROUTE");
app.use(
  "/cheeky/webhooks/square",
  express.raw({ type: "application/json" }),
  squareWebhookRouter
);
app.use(express.json());

app.use(express.static(path.join(process.cwd(), "public")));

app.use(helmet());
app.use(cors());

app.use(systemHealthRouter);
app.use(dashboardOpsRouter);
app.use(actionsRouter);
app.use("/operator", operatorLayerRouter);
app.use(orderIntakeRouter);
app.use(emailIntakeRouter);
app.use(emailIntakeAiRouter);
app.use(outlookIntakeWebhookRouter);
app.use(squareApiWebhookRouter);
app.use(squarePaymentWebhookRouter);

app.use("/cheeky/system/url", systemUrlRouter);

// Unified command layer (isolated JS module — parse → route → actions → memory)
// eslint-disable-next-line @typescript-eslint/no-require-imports
app.use("/api/command", require("../../routes/command"));

// Public webhook-friendly intake → parse + auto intake (estimate + notify email)
app.use("/intake", intakeRouter);

// Production task queue (in-memory v1)
app.use("/tasks", tasksRouter);

// Payment → production (public hook for deposits / Square-style payloads)
app.use("/payment", paymentRouter);
app.use("/orders", ordersRouter);

app.use("/followups/run", followUpsRunRouter);
app.use("/followups", followUpsRouter);
app.use("/dashboard", dashboardRouter);

// GLOBAL AUTH
app.use(requireApiKey);

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

registerJarvisApi(app);

app.use("/operator", operatorRouter);
app.use("/api/command", commandLayerRoutes);

// PROTECTED ROUTES
app.use("/cheeky", healthRouter);
app.use(testEmailRouter);
app.use(debugLastRouter);
app.use(debugReplayRouter);
app.use(ordersListRouter);
app.use(ordersBoardRouter);
app.use(ordersMoveRouter);
app.use(ordersUpdateRouter);
app.use(ordersPriorityRouter);
app.use(cheekyDbDashboardRouter);
app.use(orderDraftInvoiceRouter);
app.use(orderPublishInvoiceRouter);
app.use(orderProductionRoutingRouter);
app.use(orderGarmentsRouter);
app.use(orderDigitizingRouter);
app.use(manualReviewRouter);
app.use(dashboardTodayRouter);
app.use(dashboardTodayActionsRouter);

app.post(
  "/cheeky/orders/create",
  createOrder
);

app.post(
  "/cheeky/email-intake",
  emailIntake
);

app.post(
  "/cheeky/quote/generate",
  generateQuote
);

app.post(
  "/cheeky/invoice/create",
  createInvoice
);

app.post(
  "/cheeky/pipeline/run",
  runPipeline
);

app.post(
  "/cheeky/ai/intake",
  aiIntake
);

app.get(
  "/cheeky/followup/run",
  runFollowupEngine
);

app.get(
  "/cheeky/reactivation/run",
  runReactivationEngine
);

app.post(
  "/cheeky/voice/run",
  async (req: Request, res: Response) => {
  let pipelineInput: string | undefined;
  try {
    logger.info("STEP 1: request received");
    const provided = readProvidedApiKey(req);
    const expected = readExpectedApiKey();
    if (!provided || provided !== expected) {
      const out = errorResponse("STEP 2", "Invalid API key");
      res.status(401).json(out);
      return;
    }

    logger.info("STEP 2: api key validated");
    if (SAFETY.SYSTEM_DISABLED) {
      const out = errorResponse("STEP 3", "System disabled");
      res.status(503).json(out);
      return;
    }

    logger.info("STEP 3: safety gate passed");
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      const out = errorResponse("STEP 4", "Invalid request body");
      res.status(400).json(out);
      return;
    }

    logger.info("STEP 4: body parsed");
    const { text, inputType, notifyEmail } = parsed.data;
    pipelineInput = text;

    if (inputType === "email") {
      const notifyTo =
        notifyEmail?.trim() ||
        (process.env.INTAKE_NOTIFY_EMAIL || "").trim() ||
        "";
      if (!notifyTo) {
        const out = errorResponse(
          "INTAKE",
          "notifyEmail or INTAKE_NOTIFY_EMAIL required for inputType email"
        );
        setLastRun({ input: text, output: out, timestamp: Date.now() });
        res.status(400).json(out);
        return;
      }
      logger.info("STEP 5: intake (email path)");
      stepLog.brain("(email → intake.engine)");
      const routed = await runIntakeFromEmailText(text, notifyTo);
      stepLog.engine(`intake invoiceId=${routed.invoiceId} status=${routed.status}`);
      setLastRun({ input: text, output: routed, timestamp: Date.now() });
      logger.info("STEP 6: intake + email completed");
      res.json(routed);
      return;
    }

    const brainOut = await brain(text);
    stepLog.brain(
      `intent=${brainOut.intent} confidence=${brainOut.confidence} customer=${brainOut.customerName}`
    );
    logger.info("STEP 5: brain executed");

    const gk = gatekeeper(brainOut);
    if (gk.ok === false) {
      stepLog.gatekeeper(`blocked: ${gk.error}`);
      const out = {
        ok: false,
        success: false,
        stage: gk.stage,
        error: gk.error
      };
      setLastRun({ input: text, output: out, timestamp: Date.now() });
      res.status(400).json(out);
      return;
    }
    stepLog.gatekeeper("passed validation");

    stepLog.router("dispatch CREATE_INVOICE → sales.engine");
    const routed = await route(brainOut.intent, gk.payload);
    stepLog.engine(`invoiceId=${routed.invoiceId} status=${routed.status}`);
    logger.info("STEP 6: router completed");

    const out = {
      ...routed,
      confidence: brainOut.confidence
    };
    setLastRun({ input: text, output: out, timestamp: Date.now() });
    res.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const out = errorResponse("PIPELINE", message);
    if (pipelineInput !== undefined) {
      setLastRun({ input: pipelineInput, output: out, timestamp: Date.now() });
    }
    res.status(500).json(out);
  }
}
);

app.use(errorHandler);

try {
  app.listen(config.port, () => {
    if (!process.env.POWER_AUTOMATE_OUTLOOK_WEBHOOK) {
      console.warn(
        "⚠️ Outlook webhook not configured — running in stub mode"
      );
    }
    console.log(`🚀 Server running on port ${config.port}`);
    console.log(`Server running on port ${config.port}`);
    logger.info(`Server running on port ${config.port}`);

    cron.schedule("*/30 * * * *", async () => {
      console.log("--- FOLLOW-UP CYCLE START ---");
      try {
        const result = await runFollowUpCycle();
        console.log("Follow-up result:", result);
      } catch (err: unknown) {
        console.error(
          "Follow-up error:",
          err instanceof Error ? err.message : err
        );
      }
      console.log("--- FOLLOW-UP CYCLE END ---");
    });

    setInterval(() => {
      try {
        void runFollowUpJob();
      } catch (err: unknown) {
        console.error(
          "[followUpJob] cron:",
          err instanceof Error ? err.message : err
        );
      }
    }, 30 * 60 * 1000);

    registerQuoteRevivalInterval();
    registerPaymentCloseInterval();

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const revenueScheduler = require("../automation/scheduler");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const envValidator = require("../utils/envValidator");
      envValidator.printEnvWarnings();
      revenueScheduler.logRevenueEngineOnline();
      if (process.env.DAILY_SCHEDULER === "true") {
        revenueScheduler.startDailyScheduler({ port: config.port });
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const socialCron = require("../../social/cron/jobs");
      socialCron.register();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      console.error("Revenue engine startup hook failed:", message);
    }

    setTimeout(async () => {
      try {
        const apiKey = encodeURIComponent(
          (process.env.API_KEY || "").trim()
        );
        if (process.env.AUTO_RUN_COMMAND === "true") {
          console.log("\n🚀 AUTO RUN: revenue.command (AUTO_RUN_COMMAND)\n");
          const res = await fetch(
            `http://127.0.0.1:${config.port}/revenue/command?apikey=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({})
            }
          );
          const data = await res.json();
          if (data && data.success === false) {
            console.error("\n⚠️ AUTO RUN COMMAND FINISHED WITH ERRORS\n", data);
          } else {
            console.log("\n✅ AUTO RUN COMMAND COMPLETE\n", data);
          }
        } else if (process.env.AUTO_DAILY_RUN === "true") {
          console.log("\n🚀 AUTO RUN: revenue.command\n");
          const res = await fetch(
            `http://127.0.0.1:${config.port}/revenue/command?apikey=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({})
            }
          );
          const data = await res.json();
          if (data && data.success === false) {
            console.error(
              "\n⚠️ AUTO REVENUE COMMAND FINISHED WITH ERRORS\n",
              data
            );
          } else {
            console.log("\n✅ AUTO REVENUE COMMAND COMPLETE\n", data);
          }
        } else {
          console.log("\n🚀 AUTO RUN: outreach.close\n");
          const res = await fetch(
            `http://127.0.0.1:${config.port}/outreach/close?apikey=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({})
            }
          );
          const data = await res.json();
          console.log("\n✅ AUTO RUN COMPLETE\n", data);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
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

        await new Promise<void>((resolve, reject) => {
          transporter.verify((error: Error | null) => {
            if (error) {
              console.error("❌ EMAIL SERVER FAILED:", error.message);
              reject(error);
            } else {
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
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : String(err);
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
} catch (err) {
  console.error("SERVER FAILED TO START", err);
}
