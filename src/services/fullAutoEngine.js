"use strict";

const { getPrisma } = require("./decisionEngine");
const { getSetting } = require("./settingsService");
const { runSelfHeal } = require("./selfHealService");

async function runFullAuto() {
  const envEnabled = String(process.env.FULL_AUTO_ENABLED || "false").toLowerCase() === "true";
  const enabled = await getSetting("AUTO_ENABLED", envEnabled ? "true" : "false");
  if (String(enabled).toLowerCase() !== "true") return;

  const prisma = getPrisma();
  if (!prisma) {
    console.log("[FULL AUTO ERROR] DB_UNAVAILABLE");
    return;
  }

  const modeRaw = await getSetting("AUTO_MODE", String(process.env.FULL_AUTO_MODE || "SAFE").toUpperCase());
  const mode = String(modeRaw || "SAFE").toUpperCase() === "ACTIVE" ? "ACTIVE" : "SAFE";
  const schedulerEnabled = String(await getSetting("SCHEDULER_ENABLED", "true")).toLowerCase() === "true";
  const followupsEnabled = String(await getSetting("FOLLOWUPS_ENABLED", "true")).toLowerCase() === "true";
  const allowedInActive = new Set(["SCHEDULE_JOBS", "AUTO_FOLLOWUPS", "AUTO_QUOTES", "HEALTH_CHECK"]);

  try {
    console.log(`[FULL AUTO] Running cycle mode=${mode}`);

    try {
      await runSelfHeal();
    } catch (_e) {
      /* isolated */
    }

    try {
      if (schedulerEnabled && (mode === "SAFE" || allowedInActive.has("SCHEDULE_JOBS"))) {
        const { autoScheduleJobs } = require("./schedulerService");
        await autoScheduleJobs();
        console.log("[AUTO] Scheduling complete");
      }
    } catch (_e) {
      /* isolated */
    }

    try {
      if (followupsEnabled && (mode === "SAFE" || allowedInActive.has("AUTO_FOLLOWUPS"))) {
        const { runAutoFollowups } = require("./autoFollowupEngine");
        await runAutoFollowups();
        console.log("[AUTO] Follow-ups processed");
      }
    } catch (_e) {
      /* isolated */
    }

    try {
      if (mode === "SAFE" || allowedInActive.has("AUTO_QUOTES")) {
        const { createQuote } = require("./quoteService");
        const newOrders = await prisma.order.findMany({
          where: { status: "INTAKE" },
          select: { id: true },
          take: 100,
          orderBy: { createdAt: "asc" },
        });

        for (const o of newOrders) {
          const existing = await prisma.quote.findFirst({
            where: { orderId: o.id },
            select: { id: true },
          });
          if (existing) {
            await prisma.order.update({
              where: { id: o.id },
              data: { status: "QUOTE_CREATED" },
            });
            continue;
          }

          await createQuote(o.id);
          await prisma.order.update({
            where: { id: o.id },
            data: { status: "QUOTE_CREATED" },
          });
          console.log("[AUTO] Quote created for", o.id);
        }
      }
    } catch (_e) {
      /* isolated */
    }

    try {
      if (mode === "SAFE" || allowedInActive.has("HEALTH_CHECK")) {
        const stuck = await prisma.order.count({
          where: {
            depositPaid: false,
            createdAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
          },
        });
        if (stuck > 0) {
          console.log("[AUTO WARNING]", stuck, "orders stuck without deposit");
        }
      }
    } catch (_e) {
      /* isolated */
    }

    console.log("[FULL AUTO] Cycle complete");
  } catch (e) {
    console.log("[FULL AUTO ERROR]", e && e.message ? e.message : e);
  }
}

module.exports = { runFullAuto };
