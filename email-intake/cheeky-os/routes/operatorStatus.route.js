"use strict";

/**
 * GET /api/operator/status — additive operator / AI visibility (safe partials).
 * Mount BEFORE app.use("/api/operator", ...) so this path wins.
 */

const path = require("path");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * @param {import("express").Application} app
 */
function mountOperatorStatus(app) {
  app.get("/api/operator/status", async (_req, res) => {
    const warnings = [];
    const risks = [];
    /** @type {string[]} */
    const nextActions = [];

    let selfFixSvc = null;
    try {
      selfFixSvc = require(path.join(__dirname, "..", "services", "selfFixService"));
    } catch (_e) {
      warnings.push("self_fix_module_unavailable");
    }

    const selfFixActive =
      selfFixSvc &&
      selfFixSvc.SELF_FIX_ENABLED !== false &&
      typeof selfFixSvc.isSelfFixSystemStarted === "function" &&
      selfFixSvc.isSelfFixSystemStarted();

    if (selfFixSvc && selfFixSvc.SELF_FIX_ENABLED === false) {
      risks.push("self_fix_disabled");
    }

    const sig = String(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "").trim();
    const skipSq = process.env.SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY === "true";
    let squareWebhook = "not_configured";
    if (sig) squareWebhook = skipSq ? "key_set_verify_skipped" : "configured";
    else if (skipSq) squareWebhook = "verify_skipped_no_key";
    if (skipSq) risks.push("square_webhook_signature_skip_verify");

    const jName = String(process.env.CHEEKY_JEREMY_NAME || "Jeremy").trim() || "Jeremy";
    /** @type {{ assigned: number, printing: number, qc: number, activeClock: boolean, hoursToday: number }} */
    const jeremy = {
      assigned: 0,
      printing: 0,
      qc: 0,
      activeClock: false,
      hoursToday: 0,
    };
    try {
      const tc = require(path.join(__dirname, "..", "services", "timeClock.store"));
      const st = tc.getStatus(jName);
      jeremy.activeClock = !!(st && st.active);
      const td = tc.getTodaySummary(jName);
      jeremy.hoursToday = Math.round((Number(td.totalMinutes || 0) / 60) * 100) / 100;
    } catch (_e) {
      warnings.push("time_clock_read_failed");
    }

    const prisma = getPrisma();
    let database = "unavailable";
    let depositPaidToday = 0;
    let stuckWithoutDeposit = 0;
    let ready = 0;
    let printing = 0;
    let qc = 0;
    let completed = 0;
    let stuck = 0;
    /** @type {{ openOpportunities: number, highPriority: number, estimatedPipeline: number, draftsWaiting: number }} */
    const sales = {
      openOpportunities: 0,
      highPriority: 0,
      estimatedPipeline: 0,
      draftsWaiting: 0,
    };
    const comms = {
      drafts: 0,
      needsApproval: 0,
      approved: 0,
      errors: 0,
    };

    if (!prisma || !prisma.order) {
      warnings.push("database_unavailable");
    } else {
      try {
        await prisma.$queryRaw`SELECT 1`;
        database = "connected";
      } catch (qe) {
        database = "error";
        warnings.push("database_ping_failed:" + (qe && qe.message ? qe.message : String(qe)));
      }

      if (database === "connected") {
        try {
          const t0 = startOfToday();
          depositPaidToday = await prisma.order.count({
            where: {
              deletedAt: null,
              depositPaidAt: { gte: t0 },
            },
          });

          stuckWithoutDeposit = await prisma.order.count({
            where: {
              deletedAt: null,
              depositPaidAt: null,
              status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
            },
          });
          if (stuckWithoutDeposit > 0) {
            risks.push("orders_in_production_without_deposit_timestamp");
            nextActions.push("Review stuckWithoutDeposit orders — cash gate data may be inconsistent");
          }

          ready = await prisma.order.count({
            where: { deletedAt: null, status: "PRODUCTION_READY" },
          });
          printing = await prisma.order.count({
            where: { deletedAt: null, status: "PRINTING" },
          });
          qc = await prisma.order.count({
            where: { deletedAt: null, status: "QC" },
          });
          completed = await prisma.order.count({
            where: {
              deletedAt: null,
              OR: [
                { status: { in: ["READY", "COMPLETED"] } },
                { completedAt: { not: null } },
              ],
            },
          });

          const jLower = jName.toLowerCase();
          const jeremyRows = await prisma.order.findMany({
            where: {
              deletedAt: null,
              status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
              assignedProductionTo: { not: null },
            },
            select: { assignedProductionTo: true, status: true },
          });
          for (const r of jeremyRows) {
            if (String(r.assignedProductionTo || "").trim().toLowerCase() !== jLower) continue;
            jeremy.assigned += 1;
            if (r.status === "PRINTING") jeremy.printing += 1;
            if (r.status === "QC") jeremy.qc += 1;
          }

          const missingNextAction = await prisma.order.count({
            where: {
              deletedAt: null,
              status: "PRODUCTION_READY",
              OR: [{ nextAction: null }, { nextAction: "" }],
            },
          });
          if (missingNextAction > 0) {
            risks.push(String(missingNextAction) + " orders stuck without next action");
            nextActions.push("Assign ready orders and set nextAction");
          }

          const activeRows = await prisma.order.findMany({
            where: {
              deletedAt: null,
              status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
            },
            take: 250,
            select: {
              status: true,
              depositPaidAt: true,
              depositReceived: true,
              depositStatus: true,
              garmentsOrdered: true,
              blockedReason: true,
              updatedAt: true,
              artFiles: { select: { approvalStatus: true } },
              vendorOrders: { take: 5, select: { status: true } },
            },
          });

          const STALE_MS = 5 * 24 * 60 * 60 * 1000;
          for (const o of activeRows) {
            const st = String(o.status || "").toUpperCase();
            const reasons = [];
            const hasDep = !!o.depositPaidAt;
            const arts = o.artFiles || [];
            const hasApprovedArt = arts.some(
              (a) => String(a.approvalStatus || "").toUpperCase() === "APPROVED"
            );
            if (
              hasDep &&
              (String(o.depositStatus || "") === "NONE" || o.depositReceived === false) &&
              ["DEPOSIT_PAID", "PRODUCTION_READY", "PRINTING", "QC"].includes(st)
            ) {
              reasons.push("deposit_present_but_incomplete");
            }
            if (!hasDep && ["PRODUCTION_READY", "PRINTING", "QC"].includes(st)) {
              reasons.push("missing_deposit");
            }
            if (st === "PRODUCTION_READY" && o.garmentsOrdered !== true) {
              const br = String(o.blockedReason || "").trim();
              if (br) reasons.push("garment_blocked");
              else if (!hasApprovedArt) reasons.push("art");
              else reasons.push("garment_pending");
            }
            const vos = o.vendorOrders || [];
            if (
              vos.some((v) =>
                ["HELD", "ERROR", "FAILED", "CANCELLED"].includes(String(v.status || "").toUpperCase())
              )
            ) {
              reasons.push("vendor_error");
            }
            const age = Date.now() - new Date(o.updatedAt).getTime();
            if (age > STALE_MS && ["PRODUCTION_READY", "PRINTING", "QC", "WAITING_GARMENTS"].includes(st)) {
              reasons.push("stale");
            }
            const bu = String(o.blockedReason || "").toUpperCase();
            if (bu.includes("ERROR") || bu.includes("FAIL")) reasons.push("error_flag");

            if (reasons.length) stuck += 1;
          }
          if (stuck > 0) {
            nextActions.push("Review stuck orders with Patrick before shop executes");
          }

          const [draftsN, approvedN, errN, artChangesN, pickupGapN] = await Promise.all([
            prisma.communicationApproval.count({
              where: { status: { in: ["DRAFT", "PENDING"] } },
            }),
            prisma.communicationApproval.count({ where: { status: "APPROVED" } }),
            prisma.communicationApproval.count({ where: { status: "ERROR" } }),
            prisma.order.count({
              where: {
                deletedAt: null,
                artApprovalStatus: "CHANGES_REQUESTED",
              },
            }),
            prisma.order.count({
              where: {
                deletedAt: null,
                status: { in: ["COMPLETED", "READY"] },
                NOT: {
                  communicationApprovals: {
                    some: { messageType: "READY_FOR_PICKUP" },
                  },
                },
              },
            }),
          ]);
          comms.drafts = draftsN;
          comms.needsApproval = draftsN;
          comms.approved = approvedN;
          comms.errors = errN;
          if (draftsN > 0) {
            risks.push("Customer messages waiting for approval");
          }
          if (artChangesN > 0) {
            risks.push("Orders with art changes requested");
          }
          if (pickupGapN > 0) {
            risks.push("Completed orders missing pickup draft");
          }

          try {
            const salesEng = require(path.join(__dirname, "..", "services", "salesOpportunityEngine.service"));
            const sm = await salesEng.getSalesMetricsForOperator();
            sales.openOpportunities = sm.openOpportunities;
            sales.highPriority = sm.highPriority;
            sales.estimatedPipeline = sm.estimatedPipeline;
            sales.draftsWaiting = sm.draftsWaiting;
            if (sm.highPriority > 0 && sm.openOpportunities > 0) {
              risks.push("High value customers need follow-up");
            }
            if (sm.draftsWaiting > 0) {
              risks.push("Sales drafts waiting for approval");
            }
            if (sm.openOpportunities > 0) {
              nextActions.push("Review sales queue");
            }
            if (sm.draftsWaiting > 0) {
              nextActions.push("Approve customer follow-ups");
            }
            if (sm.openOpportunities === 0 && sm.estimatedPipeline === 0) {
              nextActions.push("Run reactivation scan");
            }
          } catch (_salesErr) {
            warnings.push("sales_metrics_unavailable");
          }
        } catch (ce) {
          warnings.push("counts_failed:" + (ce && ce.message ? ce.message : String(ce)));
        }
      }
    }

    let squareActions = { drafts: 0, approved: 0, created: 0, errors: 0 };
    try {
      const { getCounts } = require(path.join(__dirname, "..", "services", "squareActionDrafts.store"));
      squareActions = getCounts();
      if (squareActions.drafts > 0) {
        risks.push("Square drafts waiting for approval");
        nextActions.push("Review Square action drafts in Square Control");
      }
      if (squareActions.approved > 0) {
        risks.push("Square drafts approved — ready to create Square draft (no auto-send)");
        nextActions.push("Create Square drafts for approved actions when ready");
      }
      try {
        const { listAll } = require(path.join(__dirname, "..", "services", "squareActionDrafts.store"));
        const { entries } = listAll();
        const bal = (entries || []).filter(
          (e) => String(e.type || "").toUpperCase() === "BALANCE_DUE" && ["DRAFT", "APPROVED"].includes(String(e.status || "").toUpperCase())
        );
        if (bal.length > 0) {
          risks.push("Balance due actions pending");
        }
      } catch (_b) {}
      if (squareActions.errors > 0) {
        risks.push("Some Square draft actions errored — check Square Control");
      }
    } catch (_sqErr) {
      warnings.push("square_action_drafts_unavailable");
    }

    let fulfillment = { pickupReady: 0, shippingStaged: 0, needsReview: 0, completedToday: 0 };
    try {
      const fe = require(path.join(__dirname, "..", "services", "fulfillmentEngine.service"));
      fulfillment = await fe.getFulfillmentMetrics();
    } catch (_fe) {
      /* defaults */
    }

    if (fulfillment.needsReview > 0) {
      risks.push("Completed orders need pickup/shipping decision");
      nextActions.push("Review fulfillment queue — /fulfillment.html");
    }
    if (fulfillment.shippingStaged > 0) {
      risks.push("Shipping orders missing Pirate Ship label until owner copies draft");
      nextActions.push("Create Pirate Ship draft from Fulfillment board");
    }
    if (fulfillment.pickupReady > 0 && comms.drafts > 0) {
      risks.push("Pickup messages waiting for approval");
      nextActions.push("Approve pickup messages in Comms");
    }

    return res.status(200).json({
      ok: true,
      system: {
        server: "running",
        selfFix: selfFixActive ? "active" : selfFixSvc && !selfFixSvc.SELF_FIX_ENABLED ? "disabled" : "inactive",
        squareWebhook,
        database,
      },
      cashGate: {
        depositPaidToday,
        stuckWithoutDeposit,
      },
      production: {
        ready,
        printing,
        qc,
        completed,
        stuck,
      },
      jeremy,
      comms,
      sales,
      squareActions,
      fulfillment,
      risks,
      nextActions,
      warnings: warnings.length ? warnings : undefined,
      timestamp: new Date().toISOString(),
    });
  });
}

module.exports = { mountOperatorStatus };
