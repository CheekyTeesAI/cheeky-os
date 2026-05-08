"use strict";

/**
 * Cheeky OS — Self-Fix Agent v1/v2
 * Additive only: detect issues, safe auto-fix, reconciliation loop.
 * Cash gate and payment truth are never bypassed.
 *
 * Env locks (defaults): CHEEKY_SELF_FIX_ENABLED=true, CHEEKY_SELF_FIX_RECONCILE_MS=60000 (min 30000),
 * CHEEKY_SELF_FIX_AUTO_GARMENT=false
 */

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const RECONCILE_INTERVAL_MS = Math.max(
  30000,
  Number(process.env.CHEEKY_SELF_FIX_RECONCILE_MS || 60000)
);
const SELF_FIX_ENABLED = String(process.env.CHEEKY_SELF_FIX_ENABLED || "true").toLowerCase() !== "false";
const AUTO_GARMENT_IN_RECONCILE =
  String(process.env.CHEEKY_SELF_FIX_AUTO_GARMENT || "").toLowerCase() === "true";

/** Prevent concurrent garment create for same order within reconciliation + attemptAutoFix */
const garmentCreateInFlight = new Set();

let _reconcileTimer = null;
let _handlersInstalled = false;
let _selfFixSystemStarted = false;

function decisionEnginePath() {
  return path.join(__dirname, "..", "..", "..", "src", "services", "decisionEngine.js");
}

function mainPrismaPath() {
  return path.join(__dirname, "..", "..", "src", "lib", "prisma");
}

function getMainPrisma() {
  try {
    return require(mainPrismaPath());
  } catch (_) {
    return null;
  }
}

function getDecisionEngine() {
  try {
    return require(decisionEnginePath());
  } catch (_) {
    return null;
  }
}

function normalizeIssue(input) {
  const err = input && input.error ? input.error : input;
  const msg =
    err && err.message
      ? String(err.message)
      : typeof err === "string"
        ? err
        : err
          ? String(err)
          : "unknown";
  const code = err && err.code ? String(err.code) : "";
  const type = input.type || (code.startsWith("P") ? "prisma" : "runtime");
  const severity =
    input.severity ||
    (type === "uncaughtException" || type === "unhandledRejection" ? "critical" : "high");
  return {
    type,
    source: input.source || "unknown",
    severity,
    orderId: input.orderId || extractOrderIdFromMessage(msg),
    message: msg.slice(0, 2000),
    code: code || undefined,
    timestamp: new Date().toISOString(),
  };
}

function extractOrderIdFromMessage(msg) {
  const m = String(msg).match(
    /(?:orderId|order_id|order)\s*[=:]\s*([0-9a-f-]{8,}|[a-z0-9]{12,})/i
  );
  return m ? m[1] : null;
}

function logDetected(issue) {
  console.error(`🚨 SELF-FIX DETECTED ISSUE: [${issue.type}] ${issue.source} | ${issue.message.slice(0, 300)}`);
}

function logSelfFixApplied(reason, detail) {
  console.log(`SELF-FIX APPLIED: ${reason}${detail ? ` | ${detail}` : ""}`);
}

/**
 * @param {string} source
 * @param {unknown} error
 * @param {{ orderId?: string, type?: string }} [extra]
 */
function captureError(source, error, extra = {}) {
  const issueType = extra.type || classifyError(error);
  const issue = normalizeIssue({
    type: issueType,
    source,
    error,
    orderId: extra.orderId,
  });
  logDetected(issue);
  return issue;
}

function classifyError(err) {
  const msg = err && err.message ? String(err.message) : String(err || "");
  if (err && err.name === "PrismaClientKnownRequestError") return "prisma";
  if (/Prisma/.test(msg)) return "prisma";
  if (/Square|square/i.test(msg)) return "square_api";
  if (/fetch failed|ECONNREFUSED/i.test(msg)) return "network";
  return "runtime";
}

/**
 * @param {string} source e.g. webhook
 * @param {unknown} error
 * @param {{ orderId?: string }} [extra]
 */
function captureWebhookFailure(source, error, extra = {}) {
  return captureError(`webhook:${source}`, error, {
    ...extra,
    type: extra.type || "webhook_failure",
  });
}

/**
 * @param {unknown} error
 */
function captureSquareApiError(error, extra) {
  return captureError("square_api", error, extra);
}

function ensureMarketingDbUrl() {
  if (String(process.env.CHEEKY_MARKETING_DATABASE_URL || "").trim()) return false;
  const dbFile = path.join(__dirname, "..", "prisma", "marketing.db");
  process.env.CHEEKY_MARKETING_DATABASE_URL = `file:${dbFile.replace(/\\/g, "/")}`;
  try {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  } catch (_) {}
  logSelfFixApplied("marketing_db_url_fallback", process.env.CHEEKY_MARKETING_DATABASE_URL);
  return true;
}

function tryPrismaGenerateSafe() {
  try {
    const schemaMain = path.join(__dirname, "..", "..", "prisma", "schema.prisma");
    if (!fs.existsSync(schemaMain)) return false;
    execSync(`npx prisma generate --schema ${JSON.stringify(schemaMain)}`, {
      cwd: path.join(__dirname, ".."),
      stdio: "pipe",
      env: process.env,
      shell: true,
    });
    logSelfFixApplied("prisma_generate_main", schemaMain);
    return true;
  } catch (e) {
    console.warn("[self-fix] prisma generate skipped:", e && e.message ? e.message : e);
    return false;
  }
}

/**
 * Re-run decision engine for one order (cash gate inside evaluateOrderState).
 * @param {string} orderId
 */
async function evaluateProductionReady(orderId) {
  const prisma = getMainPrisma();
  const de = getDecisionEngine();
  if (!prisma || !prisma.$transaction || !de || !de.runDecisionEngineInTransaction) {
    throw new Error("prisma_or_decision_engine_unavailable");
  }
  await prisma.$transaction((tx) => de.runDecisionEngineInTransaction(tx, orderId));
}

/**
 * @param {ReturnType<normalizeIssue>} issue
 */
async function attemptAutoFix(issue) {
  if (!SELF_FIX_ENABLED) return { ok: false, reason: "self_fix_disabled" };

  try {
    if (issue.type === "prisma" && /database|url|Marketing|datasource/i.test(issue.message)) {
      if (ensureMarketingDbUrl()) {
        return { ok: true, action: "marketing_db_url" };
      }
    }

    if (issue.message && /Cannot find module '@prisma\/client'|PrismaClient is unable to run/i.test(issue.message)) {
      if (tryPrismaGenerateSafe()) {
        return { ok: true, action: "prisma_generate" };
      }
    }

    if (issue.orderId && issue.type === "state") {
      const prisma = getMainPrisma();
      if (!prisma) return { ok: false, reason: "no_prisma" };
      const o = await prisma.order.findFirst({
        where: { id: issue.orderId, deletedAt: null },
      });
      if (!o) return { ok: false, reason: "order_missing" };
      const st = String(o.status || "").toUpperCase();
      if (
        st === "DEPOSIT_PAID" &&
        o.depositPaidAt &&
        o.garmentsOrdered !== true &&
        (o.depositReceived === true || String(o.depositStatus || "").toUpperCase() === "PAID")
      ) {
        console.log(`[flow] CASH GATE PASSED (self-fix evaluate orderId=${issue.orderId})`);
        await evaluateProductionReady(issue.orderId);
        logSelfFixApplied("evaluate_production_ready", issue.orderId);
        console.log(`[flow] PRODUCTION READY (self-fix reassessed orderId=${issue.orderId})`);
        return { ok: true, action: "evaluate_production_ready" };
      }
    }

    if (issue.type === "duplicate_garment") {
      console.log(
        `SELF-FIX APPLIED (duplicate garment blocked)${issue.orderId ? ` orderId=${issue.orderId}` : ""}`
      );
      return { ok: true, action: "duplicate_blocked" };
    }

    if (issue.type === "webhook_no_order") {
      console.warn(`[self-fix] webhook_no_order — log only, orderId=${issue.orderId || "n/a"}`);
      return { ok: true, action: "log_only" };
    }
  } catch (e) {
    const em = e && e.message ? e.message : String(e);
    console.warn("[self-fix] attemptAutoFix failed:", em);
    return { ok: false, reason: em };
  }

  return { ok: false, reason: "no_matching_rule" };
}

/**
 * @param {import("@prisma/client").Prisma.OrderWhereInput} [where]
 */
async function runSystemReconciliation() {
  if (!SELF_FIX_ENABLED) return { scanned: 0, fixed: 0 };

  const prisma = getMainPrisma();
  const de = getDecisionEngine();
  if (!prisma || !prisma.order || !de || !de.runDecisionEngineInTransaction) {
    return { scanned: 0, fixed: 0, error: "deps_missing" };
  }

  let fixed = 0;
  let scanned = 0;
  const garmentPendingAutoOff = [];

  try {
    const orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: ["DEPOSIT_PAID", "PRODUCTION_READY"] },
      },
      take: 80,
      orderBy: { updatedAt: "asc" },
      /**
       * Boot-stability guard: avoid selecting optional DB columns that may be
       * absent in partially migrated environments (e.g. Order.mockupUrl).
       */
      select: {
        id: true,
        status: true,
        depositPaidAt: true,
        garmentsOrdered: true,
        updatedAt: true,
        artFiles: true,
        vendorOrders: {
          take: 5,
          select: { status: true },
        },
      },
    });
    scanned = orders.length;
    let skippedCashGate = 0;

    for (const o of orders) {
      const id = o.id;
      if (!o.depositPaidAt) {
        skippedCashGate += 1;
        continue;
      }

      const beforeStatus = String(o.status || "").toUpperCase();
      let afterStatus = beforeStatus;

      try {
        await prisma.$transaction(async (tx) => {
          const updated = await de.runDecisionEngineInTransaction(tx, id);
          afterStatus = String(updated.status || "").toUpperCase();
        });
      } catch (reErr) {
        console.warn(`[self-fix] reconciliation tx failed order=${id}:`, reErr && reErr.message ? reErr.message : reErr);
        continue;
      }

      if (afterStatus !== beforeStatus) {
        console.log(`[flow] CASH GATE PASSED (reconcile orderId=${id})`);
        console.log(`[flow] SYSTEM RECONCILED [${id}] ${beforeStatus} → ${afterStatus}`);
        fixed += 1;
        if (afterStatus === "PRODUCTION_READY") {
          console.log(`[flow] PRODUCTION READY (reconciled orderId=${id})`);
        }
      }

      const activeVoPost = (o.vendorOrders || []).some((v) =>
        ["DRAFT", "SUBMITTED", "CONFIRMED"].includes(String(v.status || "").toUpperCase())
      );

      if (
        afterStatus === "PRODUCTION_READY" &&
        o.garmentsOrdered !== true &&
        !activeVoPost &&
        !AUTO_GARMENT_IN_RECONCILE
      ) {
        garmentPendingAutoOff.push(id);
      }

      if (
        AUTO_GARMENT_IN_RECONCILE &&
        afterStatus === "PRODUCTION_READY" &&
        o.garmentsOrdered !== true &&
        !garmentCreateInFlight.has(id)
      ) {
        if (activeVoPost) continue;

        garmentCreateInFlight.add(id);
        try {
          const gmod = require(path.join(__dirname, "..", "..", "dist", "services", "garmentOrderingService"));
          const fn = gmod.createGarmentOrderForOrder;
          if (typeof fn === "function") {
            const res = await fn(id);
            const dup =
              res &&
              res.success === false &&
              res.message &&
              /already exists|duplicate/i.test(String(res.message));
            if (dup) {
              await attemptAutoFix(
                normalizeIssue({
                  type: "duplicate_garment",
                  source: "reconcile_garment",
                  orderId: id,
                  error: new Error(String(res.message)),
                })
              );
            } else if (res && res.success !== false) {
              console.log(
                `[flow] GARMENT ORDER CREATED (reconcile orderId=${id})`,
                JSON.stringify(res).slice(0, 180)
              );
              logSelfFixApplied("garment_order_reconcile", id);
            }
          }
        } catch (ge) {
          console.warn(
            `[self-fix] garment reconcile skipped order=${id}:`,
            ge && ge.message ? ge.message : ge
          );
        } finally {
          garmentCreateInFlight.delete(id);
        }
      }
    }

    if (skippedCashGate > 0) {
      console.warn(`[self-fix] reconciliation: skipped — cash gate (batch) count=${skippedCashGate}`);
    }
    if (garmentPendingAutoOff.length > 0) {
      const ids = garmentPendingAutoOff.slice(0, 20).join(",");
      const more = garmentPendingAutoOff.length > 20 ? ` +${garmentPendingAutoOff.length - 20}` : "";
      console.log(
        `[flow] garment pending (auto disabled) count=${garmentPendingAutoOff.length} examples=${ids}${more}`
      );
    }
    await runPurchasingSelfFix(prisma);
    await runQcSelfFix(prisma);
    await runOperatorSignalScan(prisma);
  } catch (e) {
    captureError("reconciliation", e);
  }

  return { scanned, fixed };
}

/**
 * Purchasing self-fix: may create draft/needs-approval plans only.
 * CHEEKY_PURCHASING_SELF_PLAN=true (default), CHEEKY_PURCHASING_ORDERED_STALE_DAYS=5
 * @param {import("@prisma/client").PrismaClient | null} prisma
 */
async function runPurchasingSelfFix(prisma) {
  const selfPlan = String(process.env.CHEEKY_PURCHASING_SELF_PLAN || "true").toLowerCase() !== "false";
  if (!selfPlan || !prisma || !prisma.order) return;

  const orderedStaleDays = Math.max(1, Number(process.env.CHEEKY_PURCHASING_ORDERED_STALE_DAYS || 5));
  let engine;
  let pStore;
  try {
    engine = require(path.join(__dirname, "purchasingEngine.service"));
    pStore = require(path.join(__dirname, "purchasing.store"));
  } catch (_e) {
    return;
  }

  try {
    const ready = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PRODUCTION_READY", "PRINTING"] },
        depositPaidAt: { not: null },
      },
      take: 50,
      select: { id: true },
      orderBy: { updatedAt: "asc" },
    });
    for (const r of ready) {
      if (pStore.findActivePlanForOrder(r.id)) continue;
      try {
        const out = await engine.buildPurchasePlanForOrder(r.id, {});
        if (out && out.plan && !out.skipped) {
          console.log(`[purchasing] SELF-FIX PLAN CREATED orderId=${r.id}`);
        }
      } catch (pe) {
        console.warn(
          `[purchasing] self-fix plan skip order=${r.id}:`,
          pe && pe.message ? pe.message : pe
        );
      }
    }

    const cutoff24h = new Date(Date.now() - 24 * 3600000).toISOString();
    for (const p of pStore.listPlans()) {
      if (String(p.status || "").toUpperCase() !== "APPROVED") continue;
      if (p.approvedAt && p.approvedAt < cutoff24h && !p.orderedAt) {
        console.log(`[purchasing] APPROVED PLAN STALE planId=${p.id}`);
      }
    }

    const cutoffOrd = new Date(Date.now() - orderedStaleDays * 86400000).toISOString();
    for (const p of pStore.listPlans()) {
      const st = String(p.status || "").toUpperCase();
      if (!["ORDERED", "PARTIALLY_RECEIVED"].includes(st)) continue;
      if (p.orderedAt && p.orderedAt < cutoffOrd && !p.receivedAt) {
        console.log(`[purchasing] ORDERED PLAN STALE planId=${p.id}`);
      }
    }
  } catch (e) {
    console.warn("[purchasing] self-fix failed:", e && e.message ? e.message : e);
  }
}

/**
 * QC observability only — never auto-pass.
 * CHEEKY_QC_STALE_HOURS=12 default
 * @param {import("@prisma/client").PrismaClient | null} prisma
 */
async function runQcSelfFix(prisma) {
  if (!prisma || !prisma.order) return;
  let qStore;
  try {
    qStore = require(path.join(__dirname, "qc.store"));
  } catch (_e) {
    return;
  }
  const staleH = Math.max(1, Number(process.env.CHEEKY_QC_STALE_HOURS || 12));
  const cutoff = new Date(Date.now() - staleH * 3600000).toISOString();
  try {
    const qcOrders = await prisma.order.findMany({
      where: { deletedAt: null, status: "QC" },
      select: { id: true },
      take: 80,
    });
    for (const r of qcOrders) {
      if (!qStore.hasAnyCheckForOrder(r.id)) {
        console.warn(`[qc] ORPHAN_QC_STAGE orderId=${r.id} no_qc_record`);
      }
    }
    for (const c of qStore.listChecks()) {
      if (String(c.status || "").toUpperCase() !== "PENDING") continue;
      const up = c.updatedAt || c.createdAt;
      if (String(up || "") < cutoff) {
        console.warn(`[qc] STALE_PENDING_QC checkId=${c.id} orderId=${c.orderId}`);
      }
    }
  } catch (e) {
    console.warn("[qc] self-fix failed:", e && e.message ? e.message : e);
  }
}

/**
 * Operator signals — log only (no auto-complete).
 * @param {import("@prisma/client").PrismaClient | null} prisma
 */
async function runOperatorSignalScan(prisma) {
  try {
    if (String(process.env.CHEEKY_JEREMY_VIEW_ENABLED || "true").toLowerCase() === "false") {
      return;
    }
    if (!prisma || !prisma.order) return;
    const hours = Math.max(1, Number(process.env.CHEEKY_OPERATOR_STUCK_HOURS || 24));
    const cutoff = new Date(Date.now() - hours * 3600000);
    const stalePrinting = await prisma.order.findMany({
      where: { deletedAt: null, status: "PRINTING", updatedAt: { lt: cutoff } },
      take: 40,
      select: { id: true },
    });
    for (const r of stalePrinting) {
      console.log("[operator] STALE PRODUCTION TASK orderId=" + r.id);
    }
    const missingNext = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: "PRODUCTION_READY",
        OR: [{ nextAction: null }, { nextAction: "" }],
      },
      take: 40,
      select: { id: true },
    });
    for (const r of missingNext) {
      console.log("[operator] MISSING NEXT ACTION orderId=" + r.id);
    }
    const assignedStale = await prisma.order.findMany({
      where: {
        deletedAt: null,
        assignedProductionTo: { not: null },
        status: { in: ["PRODUCTION_READY", "PRINTING"] },
        updatedAt: { lt: cutoff },
      },
      take: 40,
      select: { id: true },
    });
    for (const r of assignedStale) {
      console.log("[operator] STALE ASSIGNED TASK orderId=" + r.id);
    }
  } catch (_e) {
    /* observability only */
  }
}

function startReconciliationLoop() {
  if (!SELF_FIX_ENABLED) {
    console.log("[self-fix] reconciliation disabled (CHEEKY_SELF_FIX_ENABLED=false)");
    return;
  }
  if (_reconcileTimer) clearInterval(_reconcileTimer);
  _reconcileTimer = setInterval(() => {
    runSystemReconciliation().catch((e) => captureError("reconciliation_interval", e));
  }, RECONCILE_INTERVAL_MS);
  _reconcileTimer.unref?.();
  console.log(
    `[self-fix] reconciliation every ${RECONCILE_INTERVAL_MS}ms autoGarment=${AUTO_GARMENT_IN_RECONCILE}`
  );
}

function stopSelfFixReconciliation() {
  if (_reconcileTimer) {
    clearInterval(_reconcileTimer);
    _reconcileTimer = null;
    console.log("[self-fix] reconciliation loop stopped (shutdown)");
  }
}

function installProcessHandlers() {
  if (_handlersInstalled) return;
  _handlersInstalled = true;

  process.on("uncaughtException", (err) => {
    console.error(
      "[PROCESS] uncaughtException | fail |",
      err && err.stack ? err.stack : err
    );
    try {
      const issue = captureError("uncaughtException", err, { type: "uncaughtException" });
      attemptAutoFix(issue).then((r) => {
        if (r.ok) console.log("SELF-FIX APPLIED:", r.action || r.reason);
      });
    } catch (_) {}
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[PROCESS] unhandledRejection | fail |", reason);
    try {
      const issue = captureError("unhandledRejection", reason, { type: "unhandledRejection" });
      attemptAutoFix(issue).then((r) => {
        if (r.ok) console.log("SELF-FIX APPLIED:", r.action || r.reason);
      });
    } catch (_) {}
  });
}

function startSelfFixSystem() {
  if (_selfFixSystemStarted) {
    console.warn("[self-fix] startSelfFixSystem already ran — skipping duplicate");
    return;
  }
  _selfFixSystemStarted = true;
  installProcessHandlers();
  startReconciliationLoop();
  console.log(
    `[self-fix] env locks: ENABLED=${SELF_FIX_ENABLED} RECONCILE_MS=${RECONCILE_INTERVAL_MS} AUTO_GARMENT=${AUTO_GARMENT_IN_RECONCILE}`
  );
  console.log("SELF-FIX SYSTEM ACTIVE — NO CRITICAL ERRORS");
}

module.exports = {
  normalizeIssue,
  captureError,
  captureWebhookFailure,
  captureSquareApiError,
  attemptAutoFix,
  evaluateProductionReady,
  runSystemReconciliation,
  runPurchasingSelfFix,
  runQcSelfFix,
  startReconciliationLoop,
  stopSelfFixReconciliation,
  installProcessHandlers,
  startSelfFixSystem,
  ensureMarketingDbUrl,
  logSelfFixApplied,
  SELF_FIX_ENABLED,
  AUTO_GARMENT_IN_RECONCILE,
  isSelfFixSystemStarted: () => _selfFixSystemStarted,
};
