"use strict";

const express = require("express");
const router = express.Router();
const prisma = require("../prisma");
const execute = require("../ai/execute");

router.get("/api/operator/readiness", async (_req, res) => {
  const readiness = {
    success: true,
    server: "ok",
    database: "degraded",
    control: "ok",
    aiExecute: "degraded",
    payments: "degraded",
    releaseGate: "degraded",
    vendorDrafts: "degraded",
    launchReady: false,
  };

  try {
    if (prisma && prisma.lead && typeof prisma.lead.count === "function") {
      await prisma.lead.count({ take: 1 });
      readiness.database = "ok";
    }
  } catch (_) {}

  try {
    const ai = await execute("show payments");
    if (ai && ai.success !== false) readiness.aiExecute = "ok";
  } catch (_) {}

  try {
    if (prisma && prisma.lead && typeof prisma.lead.count === "function") {
      await prisma.lead.count({ where: { depositRequired: true } });
      readiness.payments = "ok";
    }
  } catch (_) {}

  try {
    if (prisma && prisma.task && typeof prisma.task.count === "function") {
      await prisma.task.count({ where: { status: "PRODUCTION_READY" } });
      readiness.releaseGate = "ok";
    }
  } catch (_) {}

  try {
    readiness.vendorDrafts = prisma && prisma.vendorOrderDraft ? "ok" : "degraded";
  } catch (_) {}

  readiness.launchReady =
    readiness.server === "ok" &&
    readiness.database === "ok" &&
    readiness.control === "ok" &&
    readiness.aiExecute === "ok" &&
    readiness.payments === "ok" &&
    readiness.releaseGate === "ok";

  return res.json(readiness);
});

module.exports = router;
