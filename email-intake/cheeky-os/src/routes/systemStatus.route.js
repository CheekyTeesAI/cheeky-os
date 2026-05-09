"use strict";

// Session 3 — /api/system/status: live subsystem flags + last processed order.

const express = require("express");
const path = require("path");
const router = express.Router();

function getStatusPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "..", "src", "lib", "prisma"));
  } catch {
    try {
      return require("../prisma");
    } catch {
      return null;
    }
  }
}

router.get("/api/system/status", async (_req, res) => {
  try {
    const prisma = getStatusPrisma();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    let ordersToday = 0;
    let depositsToday = 0;
    let productionCount = 0;
    try {
      if (prisma && prisma.order) {
        ordersToday = await prisma.order.count({
          where: { createdAt: { gte: startOfDay } },
        });
        depositsToday = await prisma.order.count({
          where: { depositPaidAt: { gte: startOfDay } },
        });
        productionCount = await prisma.order.count({
          where: { status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] } },
        });
      }
    } catch (err) {
      /* counts optional */
    }

    let square = { status: "unknown", environment: null, error: null };
    try {
      const squareIntegration = require(path.join(__dirname, "..", "..", "integrations", "square"));
      await squareIntegration.initializeSquareIntegration().catch(() => null);
      square = squareIntegration.getSquareIntegrationStatus();
    } catch (e) {
      square = { status: "error", error: e && e.message ? e.message : String(e) };
    }

    let notification = { resend: null, twilio: { configured: false } };
    try {
      const { getSendMode } = require(path.join(__dirname, "..", "..", "services", "email.send.service"));
      notification.resend = getSendMode();
    } catch (_) {
      notification.resend = { configured: false, mode: "unknown" };
    }
    const twilioSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
    const twilioToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
    const twilioFrom = String(
      process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_NUMBER || ""
    ).trim();
    notification.twilio = {
      configured: Boolean(twilioSid && twilioToken && twilioFrom),
    };

    const aiExecution = {
      openai_voice_intent: Boolean(String(process.env.OPENAI_API_KEY || "").trim()),
      anthropic_ai_execute: Boolean(String(process.env.ANTHROPIC_API_KEY || "").trim()),
    };

    const emailIntake = {
      pollerConfigured: Boolean(
        String(process.env.MS_TENANT_ID || "").trim() &&
          String(process.env.MS_CLIENT_ID || "").trim() &&
          String(process.env.MS_USER_EMAIL || "").trim()
      ),
    };

    let lastOrderProcessed = null;
    try {
      const { getLastProcessedOrder } = require(path.join(
        __dirname,
        "..",
        "..",
        "services",
        "pipelineRuntimeState.service"
      ));
      lastOrderProcessed = getLastProcessedOrder();
    } catch (_) {
      lastOrderProcessed = null;
    }

    const squareOk =
      square.status === "READY" ||
      /SKIPPED|not configured/i.test(String(square.status || "")) ||
      String(square.error || "") === "Square not configured";
    const systemStatus = prisma && prisma.order && squareOk ? "OK" : "DEGRADED";

    return res.status(200).json({
      success: true,
      uptime: process.uptime(),
      ordersToday,
      depositsToday,
      productionCount,
      systemStatus,
      timestamp: new Date().toISOString(),
      aiExecution,
      emailIntake,
      square: {
        status: square.status,
        environment: square.environment || null,
        tokenPrefix: square.tokenPrefix || "",
        location: square.location || null,
        error: square.error || null,
      },
      notification,
      lastOrderProcessed,
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      systemStatus: "DEGRADED",
      message: err && err.message ? err.message : "status_error",
      timestamp: new Date().toISOString(),
      aiExecution: null,
      emailIntake: null,
      square: null,
      notification: null,
      lastOrderProcessed: null,
    });
  }
});

module.exports = router;
