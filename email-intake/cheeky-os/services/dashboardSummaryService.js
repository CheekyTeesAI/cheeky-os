"use strict";

const fs = require("fs");
const path = require("path");
const dashboardDataService = require("../dashboard/dashboardDataService");
const { unionDbStatusesForCanonicals } = require("../utils/statusNormalizer");

const STORE_PATH = path.join(__dirname, "..", "..", "data", "cheeky-store.json");
const STORE_KEY = "cache_dashboard_summary_lastGood";

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch (_e) {
    return {};
  }
}

function writeStore(doc) {
  try {
    const dir = path.dirname(STORE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${STORE_PATH}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
    fs.renameSync(tmp, STORE_PATH);
  } catch (_e) {
    console.warn("[DASHBOARD][WARN] Unable to persist dashboard summary cache");
  }
}

function readLastGood() {
  const s = readStore();
  return s && s[STORE_KEY] ? s[STORE_KEY] : null;
}

function saveLastGood(payload) {
  const s = readStore();
  s[STORE_KEY] = payload;
  writeStore(s);
}

function n0(x) {
  const v = Number(x);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.trunc(v));
}

/** Normalize cached or legacy nested summary `data` into flat numeric contract. */
function ensureFlatSummaryData(d) {
  if (!d || typeof d !== "object") {
    return {
      blockers: 0,
      ordersOnHold: 0,
      production: 0,
      approvals: 0,
      estimates: 0,
      blanksNeeded: 0,
      artWaiting: 0,
      ordersNeedingArt: 0,
      tasks: 0,
      systemHealth: "ok",
      totalOrdersToday: 0,
      staleSources: [],
      warnings: [],
    };
  }
  if (typeof d.blockers === "number") {
    return {
      blockers: n0(d.blockers),
      ordersOnHold: n0(d.ordersOnHold),
      production: n0(d.production),
      approvals: n0(d.approvals),
      estimates: n0(d.estimates),
      blanksNeeded: n0(d.blanksNeeded),
      artWaiting: n0(d.artWaiting),
      ordersNeedingArt: n0(d.ordersNeedingArt),
      tasks: n0(d.tasks),
      systemHealth: String(d.systemHealth || "ok"),
      totalOrdersToday: n0(d.totalOrdersToday),
      staleSources: Array.isArray(d.staleSources) ? d.staleSources.map(String) : [],
      warnings: Array.isArray(d.warnings) ? d.warnings.map(String) : [],
    };
  }
  const b = d.blockers && typeof d.blockers === "object" ? d.blockers : {};
  const p = d.production && typeof d.production === "object" ? d.production : {};
  const a = d.approvals && typeof d.approvals === "object" ? d.approvals : {};
  const e = d.estimates && typeof d.estimates === "object" ? d.estimates : {};
  const bl = d.blanksNeeded && typeof d.blanksNeeded === "object" ? d.blanksNeeded : {};
  const art = d.artWaiting && typeof d.artWaiting === "object" ? d.artWaiting : {};
  const t = d.tasks && typeof d.tasks === "object" ? d.tasks : {};
  const sh = d.systemHealth && typeof d.systemHealth === "object" ? d.systemHealth : {};
  return {
    blockers: n0(b.count),
    ordersOnHold: n0(b.ordersOnHold),
    production: n0(p.productionJobsActive),
    approvals: n0(a.pendingCount),
    estimates: n0(e.pendingCount),
    blanksNeeded: n0(bl.count),
    artWaiting: n0(art.waitingCount),
    ordersNeedingArt: n0(art.needingArtCount),
    tasks: n0(t.blockedCount),
    systemHealth: sh.degraded ? "degraded" : "ok",
    totalOrdersToday: n0(d.totalOrdersToday),
    staleSources: Array.isArray(d.staleSources) ? d.staleSources.map(String) : [],
    warnings: Array.isArray(d.warnings) ? d.warnings.map(String) : [],
  };
}

function baseEnvelope() {
  return {
    success: true,
    degradedMode: false,
    safeMessage: "",
    generatedAt: nowIso(),
    cachedAt: null,
    data: ensureFlatSummaryData(null),
  };
}

async function buildDashboardSummary() {
  const env = baseEnvelope();
  try {
    const prisma = getPrisma();
    const approvals = await dashboardDataService
      .buildApprovalsPanel()
      .catch(() => ({ count: 0, generatedAt: nowIso() }));
    const health = await dashboardDataService
      .buildSystemHealth()
      .catch(() => ({ degraded: true, generatedAt: nowIso() }));
    const blocked = await dashboardDataService.blockedOrdersSummary().catch(() => ({ count: 0 }));

    let estimatesPending = 0;
    let ordersOnHold = 0;
    let blanksNeeded = 0;
    let waitingOnArt = 0;
    let needingArt = 0;
    let productionJobsActive = 0;
    let totalOrdersToday = 0;
    const queryWarnings = [];

    const onHoldDb = unionDbStatusesForCanonicals(["ON_HOLD"]);
    const prodActiveDb = unionDbStatusesForCanonicals(["READY_FOR_PRODUCTION", "IN_PRODUCTION", "QC"]);
    const blanksStatusDb = unionDbStatusesForCanonicals([
      "READY_FOR_PRODUCTION",
      "IN_PRODUCTION",
      "QC",
      "APPROVED",
    ]);

    if (prisma && prisma.order) {
      try {
        ordersOnHold = await prisma.order.count({
          where: {
            deletedAt: null,
            OR: [{ status: { in: onHoldDb.length ? onHoldDb : ["ON_HOLD"] } }, { blockedReason: { not: null } }],
          },
        });
      } catch (e) {
        console.warn("[PRISMA][WARN] ordersOnHold query:", e && e.message ? e.message : String(e));
        queryWarnings.push("orders_on_hold_query_failed");
      }
      try {
        productionJobsActive = await prisma.order.count({
          where: { deletedAt: null, status: { in: prodActiveDb.length ? prodActiveDb : ["PRODUCTION_READY", "PRINTING", "QC"] } },
        });
      } catch (e) {
        console.warn("[PRISMA][WARN] production query:", e && e.message ? e.message : String(e));
        queryWarnings.push("production_query_failed");
      }
      try {
        blanksNeeded = await prisma.order.count({
          where: {
            deletedAt: null,
            garmentsOrdered: false,
            OR: [
              { status: { in: blanksStatusDb.length ? blanksStatusDb : ["PRODUCTION_READY", "PRINTING", "QC", "DEPOSIT_PAID"] } },
              { jobCreated: true },
            ],
          },
        });
      } catch (e) {
        console.warn("[PRISMA][WARN] blanks query:", e && e.message ? e.message : String(e));
        queryWarnings.push("blanks_query_failed");
      }
      try {
        waitingOnArt = await prisma.order.count({
          where: {
            deletedAt: null,
            OR: [
              { artApprovalStatus: { in: ["NOT_REQUESTED", "REQUESTED", "CHANGES_REQUESTED"] } },
              { artFileStatus: { in: ["NEEDS_ART", "MISSING", "ART_IN_REVIEW"] } },
            ],
          },
        });
      } catch (e) {
        console.warn("[PRISMA][WARN] waitingOnArt query:", e && e.message ? e.message : String(e));
        queryWarnings.push("art_waiting_query_failed");
      }
      try {
        needingArt = await prisma.order.count({
          where: {
            deletedAt: null,
            OR: [
              { artApprovalStatus: "CHANGES_REQUESTED" },
              { artFileStatus: { in: ["NEEDS_ART", "MISSING", "ART_IN_REVIEW"] } },
            ],
          },
        });
      } catch (e) {
        console.warn("[PRISMA][WARN] needingArt query:", e && e.message ? e.message : String(e));
        queryWarnings.push("art_needing_query_failed");
      }
      try {
        if (prisma.estimate && prisma.estimate.count) {
          estimatesPending = await prisma.estimate.count({
            where: { status: { notIn: ["CONVERTED", "WON", "LOST", "CANCELLED", "DECLINED", "EXPIRED", "CLOSED"] } },
          });
        }
      } catch (e) {
        console.warn("[PRISMA][WARN] estimates query:", e && e.message ? e.message : String(e));
        queryWarnings.push("estimates_query_failed");
      }
      try {
        const t0 = new Date();
        t0.setHours(0, 0, 0, 0);
        totalOrdersToday = await prisma.order.count({
          where: { deletedAt: null, createdAt: { gte: t0 } },
        });
      } catch (e) {
        console.warn("[PRISMA][WARN] totalOrdersToday query:", e && e.message ? e.message : String(e));
        queryWarnings.push("total_orders_today_query_failed");
      }
    } else {
      env.degradedMode = true;
      env.safeMessage = "Prisma unavailable; showing degraded dashboard summary.";
      env.data.warnings.push("prisma_unavailable");
      env.data.staleSources.push("prisma");
    }

    const blockersCount = n0(blocked.count);
    env.data.blockers = blockersCount;
    env.data.ordersOnHold = n0(ordersOnHold);
    env.data.production = n0(productionJobsActive);
    env.data.approvals = n0(approvals.count);
    env.data.estimates = n0(estimatesPending);
    env.data.blanksNeeded = n0(blanksNeeded);
    env.data.artWaiting = n0(waitingOnArt);
    env.data.ordersNeedingArt = n0(needingArt);
    env.data.tasks = blockersCount;
    env.data.systemHealth = health.degraded ? "degraded" : "ok";
    env.data.totalOrdersToday = n0(totalOrdersToday);

    if (prisma && prisma.order && blockersCount === 0 && productionJobsActive === 0 && estimatesPending === 0) {
      try {
        const sample = await prisma.order.findMany({
          where: { deletedAt: null },
          take: 80,
          select: { id: true, status: true },
        });
        if (sample && sample.length) {
          console.warn("[NORMALIZE][WARN] summary counts all zero with orders present — raw statuses:", sample.map((r) => r.status).join(", "));
        }
      } catch (_dump) {}
    }

    if (
      prisma &&
      prisma.order &&
      !queryWarnings.includes("art_waiting_query_failed") &&
      !queryWarnings.includes("art_needing_query_failed")
    ) {
      if (!global.__CHEEKY_SCHEMA_ARTFILE_LOGGED__) {
        global.__CHEEKY_SCHEMA_ARTFILE_LOGGED__ = true;
        console.log("[SCHEMA][MIGRATED] Order.artFileStatus Prisma queries healthy");
      }
    }

    const mergedWarnings = [...(env.data.warnings || [])];
    const mergedStale = [...(env.data.staleSources || [])];
    if (queryWarnings.length) {
      env.degradedMode = true;
      env.safeMessage = "Prisma partially unavailable. Showing best-effort dashboard summary.";
      for (const w of queryWarnings) mergedWarnings.push(w);
      mergedStale.push("prisma");
    }
    env.data.warnings = mergedWarnings;
    env.data.staleSources = [...new Set(mergedStale)];

    saveLastGood({
      generatedAt: env.generatedAt,
      payload: env,
    });
    return env;
  } catch (e) {
    console.warn("[DASHBOARD][WARN] summary build failed:", e && e.message ? e.message : String(e));
    const cached = readLastGood();
    if (cached && cached.payload) {
      const out = { ...cached.payload };
      out.degradedMode = true;
      out.safeMessage = "Dashboard degraded. Showing cached operational data.";
      out.generatedAt = nowIso();
      out.cachedAt = cached.generatedAt || nowIso();
      out.data = ensureFlatSummaryData(out.data);
      if (Array.isArray(out.data.staleSources)) out.data.staleSources = Array.from(new Set(out.data.staleSources.concat(["summary_cache"])));
      else out.data.staleSources = ["summary_cache"];
      if (!Array.isArray(out.data.warnings)) out.data.warnings = [];
      out.data.warnings.push("served_from_summary_cache");
      console.warn("[DASHBOARD][CACHE] serving last-good dashboard summary");
      return out;
    }
    const out = baseEnvelope();
    out.degradedMode = true;
    out.safeMessage = "Dashboard is online. Live sources unavailable; safe defaults shown.";
    out.data.warnings = ["Live summary unavailable"];
    out.data.staleSources = ["live_summary_unavailable"];
    return out;
  }
}

module.exports = {
  buildDashboardSummary,
  readLastGood,
  ensureFlatSummaryData,
};
