"use strict";

/**
 * Sales + reactivation opportunity scanner (local Prisma first).
 * Draft-only follow-ups — never sends. Square hooks are best-effort and non-blocking.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const STATUSES = new Set(["OPEN", "DRAFTED", "CONTACTED", "WON", "LOST", "SNOOZED"]);
const TYPES = new Set([
  "REACTIVATION",
  "RECENT_BUYER_FOLLOWUP",
  "SCHOOL_REORDER",
  "SEASONAL_CAMPAIGN",
  "QUOTE_FOLLOWUP",
  "LARGE_ACCOUNT",
]);

const QUOTE_LIKE = new Set([
  "QUOTE_SENT",
  "ATTENTION_REQUIRED",
  "INTAKE",
  "AWAITING_DEPOSIT",
]);

const ORG_HINT = /school|church|team|district|pto|booster|athletic|university|college|ministry|lions club|rotary/i;

const DAY_MS = 86400000;
const REACTIVATION_MIN_DAYS = 60;
const REACTIVATION_MAX_DAYS = 365;
const RECENT_DAYS = 60;
const FOLLOWUP_QUIET_DAYS = 30;
const LARGE_ACCOUNT_FLOOR = 4000;
const REPEAT_VALUE_FLOOR = 2200;

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function monthWindowKey() {
  return new Date().toISOString().slice(0, 7);
}

function slugEmail(email) {
  const e = String(email || "")
    .trim()
    .toLowerCase();
  if (!e || !e.includes("@")) return "";
  return crypto.createHash("sha256").update(e).digest("hex").slice(0, 24);
}

function daysBetween(d0, d1) {
  return Math.floor((d1.getTime() - d0.getTime()) / DAY_MS);
}

function pickDraftMessageType(oppType) {
  const t = String(oppType || "").toUpperCase();
  if (t === "QUOTE_FOLLOWUP") return "QUOTE_FOLLOWUP";
  if (t === "REACTIVATION" || t === "SEASONAL_CAMPAIGN") return t === "SEASONAL_CAMPAIGN" ? "SEASONAL_CAMPAIGN" : "REACTIVATION";
  if (t === "SCHOOL_REORDER" || t === "LARGE_ACCOUNT") return "BULK_NUDGE";
  return "CHECK_IN";
}

/**
 * @param {{ autoDraft?: boolean, limitBuckets?: number }} [opts]
 */
async function runSalesOpportunityScan(opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const prisma = getPrisma();
  if (!prisma || !prisma.salesOpportunity) {
    return { ok: false, error: "prisma_unavailable", created: 0, skipped: 0 };
  }

  const window = monthWindowKey();
  let created = 0;
  let skipped = 0;
  const takeOrders = Math.min(Number(options.orderLimit) || 4000, 8000);

  /** @type {import("@prisma/client").Prisma.OrderWhereInput} */
  const whereOrders = { deletedAt: null };
  let orders;
  try {
    orders = await prisma.order.findMany({
      where: whereOrders,
      take: takeOrders,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        customerId: true,
        customerName: true,
        email: true,
        phone: true,
        status: true,
        notes: true,
        totalAmount: true,
        amountPaid: true,
        quotedAmount: true,
        updatedAt: true,
        createdAt: true,
        completedAt: true,
        lastFollowupAt: true,
      },
    });
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e), created: 0, skipped: 0 };
  }

  /** @type {Map<string, object>} */
  const buckets = new Map();
  for (const o of orders) {
    const em = String(o.email || "")
      .trim()
      .toLowerCase();
    if (!em || !em.includes("@")) {
      skipped += 1;
      continue;
    }
    const key = o.customerId ? `cid:${o.customerId}` : `em:${em}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        customerId: o.customerId || null,
        customerName: o.customerName || "Customer",
        customerEmail: em,
        customerPhone: o.phone || null,
        orders: [],
      };
      buckets.set(key, b);
    }
    b.orders.push(o);
    if (o.customerName && String(o.customerName).trim().length > 1) b.customerName = o.customerName;
    if (o.phone && !b.customerPhone) b.customerPhone = o.phone;
  }

  const bucketList = [...buckets.values()];
  const cap = Number(options.limitBuckets);
  const limitB =
    Number.isFinite(cap) && cap > 0 ? Math.min(cap, bucketList.length) : bucketList.length;

  /** @type {object[]} */
  const newHighForDraft = [];

  for (let i = 0; i < limitB; i += 1) {
    const b = bucketList[i];
    const now = new Date();
    let lifetime = 0;
    let lastTouch = new Date(0);
    let orderCount = b.orders.length;
    let hasQuote = false;
    let recentFollowup = false;
    let quoteValue = 0;
    let textBlob = "";

    for (const o of b.orders) {
      const paid = Number(o.amountPaid || 0) || 0;
      const tot = Number(o.totalAmount || 0) || Number(o.quotedAmount || 0) || 0;
      lifetime += Math.max(paid, tot);
      const st = String(o.status || "").toUpperCase();
      if (QUOTE_LIKE.has(st)) {
        hasQuote = true;
        quoteValue = Math.max(quoteValue, tot);
      }
      const touch = new Date(
        Math.max(
          new Date(o.updatedAt).getTime(),
          new Date(o.createdAt).getTime(),
          o.completedAt ? new Date(o.completedAt).getTime() : 0
        )
      );
      if (touch > lastTouch) lastTouch = touch;
      if (o.lastFollowupAt) {
        const lf = new Date(o.lastFollowupAt);
        if (daysBetween(lf, now) < FOLLOWUP_QUIET_DAYS) recentFollowup = true;
      }
      textBlob += ` ${o.customerName || ""} ${o.notes || ""}`;
    }

    const daysSince = daysBetween(lastTouch, now);
    const orgHint = ORG_HINT.test(textBlob);
    const seasonMonth = now.getUTCMonth();
    const seasonalWindow = [1, 2, 3, 7, 8, 9].includes(seasonMonth);

    if (recentFollowup && daysSince < REACTIVATION_MIN_DAYS) {
      skipped += 1;
      continue;
    }

    /** @type {{ type: string, priority: string, reason: string, est: number, next: string } | null} */
    let best = null;

    function consider(candidate) {
      if (!candidate) return;
      if (!best) {
        best = candidate;
        return;
      }
      const rank = { HIGH: 3, NORMAL: 2, LOW: 1 };
      if ((rank[candidate.priority] || 0) > (rank[best.priority] || 0)) best = candidate;
      else if (candidate.priority === best.priority && candidate.est > best.est) best = candidate;
    }

    if (hasQuote) {
      consider({
        type: "QUOTE_FOLLOWUP",
        priority: quoteValue >= 1500 ? "HIGH" : "NORMAL",
        reason: "Open quote / estimate path — cash follow-up",
        est: quoteValue || lifetime,
        next: "Send friendly quote check-in (draft)",
      });
    }

    if (lifetime >= LARGE_ACCOUNT_FLOOR) {
      consider({
        type: "LARGE_ACCOUNT",
        priority: "HIGH",
        reason: "High lifetime value account",
        est: lifetime,
        next: "Relationship touch — reorder or next event",
      });
    }

    if (orgHint && (daysSince >= 30 || hasQuote)) {
      consider({
        type: "SCHOOL_REORDER",
        priority: orgHint && lifetime > 1500 ? "HIGH" : "NORMAL",
        reason: "School / team / org signal in history",
        est: Math.max(lifetime, quoteValue),
        next: "Seasonal or roster reorder check-in",
      });
    }

    if (daysSince >= REACTIVATION_MIN_DAYS && daysSince <= REACTIVATION_MAX_DAYS) {
      consider({
        type: seasonalWindow ? "SEASONAL_CAMPAIGN" : "REACTIVATION",
        priority: lifetime > 3000 ? "HIGH" : "NORMAL",
        reason: seasonalWindow
          ? "Seasonal window + dormant customer band"
          : "Last touch 60–365d — reactivation band",
        est: lifetime,
        next: "Warm reactivation message (draft)",
      });
    }

    if (daysSince < RECENT_DAYS && (orderCount >= 2 || lifetime >= REPEAT_VALUE_FLOOR)) {
      consider({
        type: "RECENT_BUYER_FOLLOWUP",
        priority: lifetime > 4000 ? "HIGH" : "NORMAL",
        reason: "Recent buyer / repeat signal",
        est: lifetime,
        next: "Short thank-you + next-run prompt",
      });
    }

    if (!best) {
      skipped += 1;
      continue;
    }

    const idem = `opp-${window}-${best.type}-${b.customerId || slugEmail(b.customerEmail)}`;

    try {
      const prior = await prisma.salesOpportunity.findUnique({ where: { idempotencyKey: idem } });
      const row = await prisma.salesOpportunity.upsert({
        where: { idempotencyKey: idem },
        create: {
          customerId: b.customerId,
          customerName: String(b.customerName || "").slice(0, 200),
          customerEmail: b.customerEmail,
          customerPhone: b.customerPhone,
          source: "local_scan",
          type: best.type,
          priority: best.priority,
          status: "OPEN",
          estimatedValue: best.est,
          reason: best.reason,
          nextAction: best.next,
          lastOrderDate: lastTouch.getTime() > 0 ? lastTouch : null,
          idempotencyKey: idem,
        },
        update: {
          estimatedValue: best.est,
          reason: best.reason,
          nextAction: best.next,
          lastOrderDate: lastTouch.getTime() > 0 ? lastTouch : undefined,
          priority: best.priority,
          updatedAt: new Date(),
        },
      });
      if (!prior) {
        console.log(`[sales] OPPORTUNITY CREATED customer=${b.customerName} type=${best.type}`);
        created += 1;
        if (best.priority === "HIGH") newHighForDraft.push(row);
      }
    } catch (pe) {
      console.warn("[sales] opportunity upsert skipped:", pe && pe.message ? pe.message : pe);
      skipped += 1;
    }
  }

  /** Optional Square enrichment (never throws to caller). */
  try {
    if (options.enrichSquare !== false) {
      const { getRevenueFollowups } = require("./revenueFollowups");
      const fu = await getRevenueFollowups();
      const stale = (fu && fu.staleEstimates) || [];
      for (const row of stale.slice(0, 40)) {
        try {
          const email = String(row.email || row.customerEmail || "")
            .trim()
            .toLowerCase();
          if (!email || !email.includes("@")) continue;
          const idem = `opp-${window}-QUOTE_FOLLOWUP-${slugEmail(email)}`;
          await prisma.salesOpportunity.upsert({
            where: { idempotencyKey: idem },
            create: {
              customerName: String(row.name || row.customerName || "Customer").slice(0, 200),
              customerEmail: email,
              customerPhone: row.phone || null,
              source: "square_enrichment",
              type: "QUOTE_FOLLOWUP",
              priority: "NORMAL",
              status: "OPEN",
              estimatedValue: Number(row.amount || row.total || 0) || 0,
              reason: "Stale estimate signal from revenue follow-up feed (Square)",
              nextAction: "Review quote status",
              idempotencyKey: idem,
            },
            update: {
              updatedAt: new Date(),
            },
          });
        } catch (_enr) {
          /* ignore row */
        }
      }
    }
  } catch (_) {
    /* non-blocking */
  }

  if (options.autoDraft === true && newHighForDraft.length) {
    for (const r of newHighForDraft.slice(0, 15)) {
      try {
        await createSalesFollowupDraft(r.id);
      } catch (de) {
        console.warn("[sales] auto-draft skipped:", de && de.message ? de.message : de);
      }
    }
  }

  return { ok: true, created, skipped, window };
}

async function createSalesFollowupDraft(opportunityId) {
  const prisma = getPrisma();
  if (!prisma || !prisma.salesOpportunity) return { ok: false, error: "prisma_unavailable" };
  const opp = await prisma.salesOpportunity.findFirst({ where: { id: String(opportunityId || "").trim() } });
  if (!opp) return { ok: false, error: "not_found" };
  if (opp.status === "WON" || opp.status === "LOST") {
    return { ok: false, error: "opportunity_closed" };
  }
  const existingDraft = await prisma.communicationApproval.findFirst({
    where: {
      salesOpportunityId: opp.id,
      status: { notIn: ["SENT", "CANCELED"] },
    },
  });
  if (existingDraft) {
    return { ok: true, communicationId: existingDraft.id, existing: true };
  }
  const { generateSalesMessage } = require("./salesMessageDraft.service");
  const msgType = pickDraftMessageType(opp.type);
  const idem = `sales-opp-${opp.id}-v1`.slice(0, 120);
  const out = await generateSalesMessage({
    type: msgType,
    email: opp.customerEmail,
    customerName: opp.customerName,
    orderId: null,
    idempotencyKey: idem,
    salesOpportunityId: opp.id,
    messageType: "SALES_FOLLOWUP",
  });
  if (!out.ok || !out.id) return { ok: false, error: out.error || "draft_failed" };

  await prisma.salesOpportunity.update({
    where: { id: opp.id },
    data: { status: "DRAFTED", updatedAt: new Date() },
  });
  console.log(`[sales] FOLLOW-UP DRAFT CREATED opportunityId=${opp.id}`);
  return { ok: true, communicationId: out.id, draftOnly: true };
}

async function patchOpportunityStatus(opportunityId, status, note) {
  const prisma = getPrisma();
  if (!prisma || !prisma.salesOpportunity) return { ok: false, error: "prisma_unavailable" };
  const st = String(status || "")
    .trim()
    .toUpperCase();
  if (!STATUSES.has(st)) return { ok: false, error: "invalid_status" };
  const id = String(opportunityId || "").trim();
  const existing = await prisma.salesOpportunity.findFirst({ where: { id } });
  if (!existing) return { ok: false, error: "not_found" };
  const data = {
    status: st,
    updatedAt: new Date(),
  };
  if (typeof note === "string" && note.trim()) {
    const line = `[${new Date().toISOString()}] ${note.trim()}`;
    data.internalNote = existing.internalNote ? `${existing.internalNote}\n${line}` : line;
  }
  if (st === "CONTACTED") data.lastContactedAt = new Date();
  const row = await prisma.salesOpportunity.update({ where: { id }, data });
  return { ok: true, opportunity: row };
}

async function getOpportunitiesList() {
  const prisma = getPrisma();
  if (!prisma || !prisma.salesOpportunity) {
    return {
      ok: true,
      opportunities: [],
      metrics: { open: 0, drafted: 0, highPriority: 0, estimatedPipeline: 0 },
    };
  }
  /** @type {object[]} */
  let rows = [];
  try {
    rows = await prisma.salesOpportunity.findMany({
      orderBy: { updatedAt: "desc" },
      take: 250,
    });
  } catch (_e) {
    return {
      ok: true,
      opportunities: [],
      metrics: { open: 0, drafted: 0, highPriority: 0, estimatedPipeline: 0 },
      warning: "sales_opportunity_table_unavailable",
    };
  }
  const priRank = { HIGH: 0, NORMAL: 1, LOW: 2 };
  rows.sort((a, b) => {
    const pa = priRank[a.priority] != null ? priRank[a.priority] : 9;
    const pb = priRank[b.priority] != null ? priRank[b.priority] : 9;
    if (pa !== pb) return pa - pb;
    return (Number(b.estimatedValue) || 0) - (Number(a.estimatedValue) || 0);
  });
  const active = rows.filter((r) => !["WON", "LOST"].includes(r.status));
  const open = active.filter((r) => r.status === "OPEN").length;
  const drafted = active.filter((r) => r.status === "DRAFTED").length;
  const highPriority = active.filter((r) => r.priority === "HIGH").length;
  const estimatedPipeline = active.reduce((s, r) => s + (Number(r.estimatedValue) || 0), 0);
  return {
    ok: true,
    opportunities: rows,
    metrics: { open, drafted, highPriority, estimatedPipeline },
  };
}

async function buildSalesBrief() {
  const prisma = getPrisma();
  const ts = new Date().toISOString();
  if (!prisma || !prisma.salesOpportunity) {
    return {
      ok: true,
      headline: "Sales brief unavailable (database)",
      todayFocus: [],
      topOpportunities: [],
      draftsWaiting: [],
      pipelineEstimate: 0,
      recommendedActions: ["Connect database for sales opportunities"],
      timestamp: ts,
    };
  }
  /** @type {object[]} */
  let top = [];
  /** @type {object[]} */
  let drafts = [];
  try {
    top = await prisma.salesOpportunity.findMany({
      where: { status: { in: ["OPEN", "DRAFTED", "CONTACTED", "SNOOZED"] } },
      orderBy: [{ estimatedValue: "desc" }, { updatedAt: "desc" }],
      take: 12,
    });
    drafts = await prisma.communicationApproval.findMany({
      where: {
        messageType: "SALES_FOLLOWUP",
        status: { in: ["DRAFT", "PENDING", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        subject: true,
        toAddress: true,
        status: true,
        salesOpportunityId: true,
        createdAt: true,
      },
    });
  } catch (_e) {
    return {
      ok: true,
      headline: "Sales brief unavailable",
      todayFocus: [],
      topOpportunities: [],
      draftsWaiting: [],
      pipelineEstimate: 0,
      recommendedActions: ["Run prisma migrate for sales engine tables"],
      timestamp: ts,
      warning: "sales_brief_query_failed",
    };
  }

  const pipelineEstimate = top.reduce((s, r) => s + (Number(r.estimatedValue) || 0), 0);
  const todayFocus = top
    .filter((r) => r.status === "OPEN" && r.priority === "HIGH")
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      type: r.type,
      customer: r.customerName,
      est: r.estimatedValue,
      reason: r.reason,
    }));
  const recommendedActions = [];
  if (todayFocus.length) recommendedActions.push("Call or email top HIGH priority OPEN opportunities");
  if (drafts.length) recommendedActions.push("Approve sales follow-up drafts in Comms queue");
  if (!todayFocus.length && top.some((r) => r.status === "OPEN")) {
    recommendedActions.push("Run sales scan and queue drafts for warm leads");
  }
  if (recommendedActions.length > 5) recommendedActions.length = 5;
  return {
    ok: true,
    headline: "Sales brief ready",
    todayFocus,
    topOpportunities: top.slice(0, 8).map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      priority: r.priority,
      customerName: r.customerName,
      estimatedValue: r.estimatedValue,
      reason: r.reason,
    })),
    draftsWaiting: drafts,
    pipelineEstimate,
    recommendedActions: recommendedActions.length
      ? recommendedActions
      : ["Review /api/sales/opportunities when database is ready"],
    timestamp: ts,
  };
}

async function getSalesMetricsForOperator() {
  const prisma = getPrisma();
  if (!prisma) {
    return {
      openOpportunities: 0,
      highPriority: 0,
      estimatedPipeline: 0,
      draftsWaiting: 0,
    };
  }
  try {
    const active = await prisma.salesOpportunity.findMany({
      where: { status: { in: ["OPEN", "DRAFTED", "CONTACTED", "SNOOZED"] } },
      select: { estimatedValue: true, priority: true, status: true },
    });
    const openOpportunities = active.filter((r) => r.status === "OPEN").length;
    const highPriority = active.filter((r) => r.priority === "HIGH").length;
    const estimatedPipeline = active.reduce((s, r) => s + (Number(r.estimatedValue) || 0), 0);
    const draftsWaiting = await prisma.communicationApproval.count({
      where: {
        messageType: "SALES_FOLLOWUP",
        status: { in: ["DRAFT", "PENDING"] },
      },
    });
    return { openOpportunities, highPriority, estimatedPipeline, draftsWaiting };
  } catch (_) {
    return {
      openOpportunities: 0,
      highPriority: 0,
      estimatedPipeline: 0,
      draftsWaiting: 0,
    };
  }
}

function scanStatePath() {
  return path.join(__dirname, "..", "data", "sales-scan-state.json");
}

/**
 * Idempotent daily hook — safe to call frequently.
 */
async function maybeRunDailySalesScan() {
  if (String(process.env.CHEEKY_SALES_SCAN_ENABLED || "").trim().toLowerCase() !== "true") {
    return { ran: false, reason: "disabled" };
  }
  const hourWant = Math.min(23, Math.max(0, Number(process.env.CHEEKY_SALES_SCAN_HOUR || 8) || 8));
  const d = new Date();
  if (d.getHours() !== hourWant || d.getMinutes() > 25) {
    return { ran: false, reason: "not_window" };
  }
  const today = d.toISOString().slice(0, 10);
  const p = scanStatePath();
  let lastRun = "";
  try {
    if (fs.existsSync(p)) {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      lastRun = String(j.lastRun || "");
    }
  } catch (_) {}
  if (lastRun === today) return { ran: false, reason: "already_ran" };

  const autoDraft = String(process.env.CHEEKY_SALES_AUTO_DRAFT || "").trim().toLowerCase() === "true";
  const out = await runSalesOpportunityScan({ autoDraft, enrichSquare: true });
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ lastRun: today, at: new Date().toISOString(), scan: out }, null, 2), "utf8");
  } catch (_) {}
  return { ran: true, ...out };
}

module.exports = {
  runSalesOpportunityScan,
  createSalesFollowupDraft,
  patchOpportunityStatus,
  getOpportunitiesList,
  buildSalesBrief,
  getSalesMetricsForOperator,
  maybeRunDailySalesScan,
  STATUSES,
  TYPES,
};
