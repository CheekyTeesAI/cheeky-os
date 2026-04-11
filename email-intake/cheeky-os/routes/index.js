/**
 * Cheeky OS — Main router index.
 * Mounts all sub-routers and provides global error handling.
 * Mount this at app.use('/cheeky', require('./cheeky-os/routes'))
 *
 * @module cheeky-os/routes
 */

const { Router } = require("express");
const controlRouter = require("./control");
const voiceRouter = require("./voice");
const systemRouter = require("./system");
const invoiceRouter = require("./invoice");
const autopilotRoutes = require("./autopilot");
const followup2Router = require("./followup2.js");
const paymentRoutes = require("./payments");
const dataRoutes = require("./data");
const commandRoutes = require("./commands");
const marketingRoutes = require("./marketing");
const leadsRoutes = require("./leads");
const { startFollowupScheduler } = require("../followup/scheduler");
const { logger } = require("../utils/logger");

const router = Router();

// ── Sub-router mounts ───────────────────────────────────────────────────────
// Control actions: POST /cheeky/run, /cheeky/followups, /cheeky/build, etc.
router.use("/", controlRouter);

// Voice commands: POST /cheeky/voice/run, GET /cheeky/voice/commands, etc.
router.use("/", voiceRouter); 
router.use("/autopilot", autopilotRoutes);

// System monitoring: GET /cheeky/health, /cheeky/activity, /cheeky/mobile, etc.
router.use("/", systemRouter);

// Invoice creation: POST /cheeky/invoice/create, /cheeky/invoice/from-quote
router.use("/invoice", invoiceRouter);

// Followup Engine 2.0: /cheeky/followup2/track, open, stale, hot, run, next, mark-paid
router.use("/followup2", followup2Router);
router.use("/followups", followup2Router);

// Payment sync: /cheeky/payments/sync, status, webhook, open, paid
router.use("/payments", paymentRoutes);

// Data layer: /cheeky/data/mode, snapshot, deals, events, customers, payments
router.use("/data", require("./data"));

// Command center: POST /cheeky/commands/run
router.use("/commands", commandRoutes);

// Revenue engine: /cheeky/marketing/*
router.use("/marketing", marketingRoutes);

// Lead capture: /cheeky/leads/create
router.use("/leads", leadsRoutes);

// ── Start followup scheduler (6-hour cycle)
startFollowupScheduler();

// ── Global error handler for /cheeky/* routes ───────────────────────────────
router.use((err, req, res, _next) => {
  logger.error(`[CHEEKY-OS] Unhandled error on ${req.method} ${req.originalUrl}: ${err.message}`);
  res.status(500).json({
    ok: false,
    data: null,
    error: err.message || "Internal server error",
  });
});

module.exports = router;
