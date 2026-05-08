"use strict";

/**
 * Morning control brief — aggregates owner, production, comms, sales, fulfillment (additive).
 * Never auto-sends; uses existing services only.
 */

const path = require("path");
const store = require("./dailyDigests.store");
const { computeStuckReasons } = require("./operatorStuckReasons");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function truthyEnv(k) {
  return String(process.env[k] || "")
    .trim()
    .toLowerCase() === "true";
}

function digestNYKey() {
  return store.digestDateKeyNY();
}

function summarizeLineItems(items) {
  try {
    if (!items || !items.length) return null;
    return items
      .map((i) => {
        const q = i.quantity != null ? i.quantity : "?";
        const d = i.description || "item";
        return String(d).slice(0, 60) + " ×" + q;
      })
      .join("; ")
      .slice(0, 220);
  } catch {
    return null;
  }
}

/**
 * Slim production slice (mirrors /api/production-board stuck + move-today signals).
 */
async function getProductionDigestSlice() {
  const prisma = getPrisma();
  if (!prisma || !prisma.order) {
    return {
      ok: false,
      error: "prisma_unavailable",
      stuckOrders: [],
      buckets: { PRODUCTION_READY: 0, PRINTING: 0, QC: 0, STUCK: 0 },
      readySample: [],
    };
  }

  const takeActive = 200;
  try {
    const activeOrders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] },
      },
      orderBy: { updatedAt: "asc" },
      take: takeActive,
      include: {
        artFiles: { select: { id: true, approvalStatus: true } },
        vendorOrders: { take: 8, select: { id: true, status: true } },
        lineItems: {
          take: 8,
          select: { description: true, quantity: true, productionType: true },
        },
      },
    });

    let nReady = 0;
    let nPrint = 0;
    let nQc = 0;
    /** @type {object[]} */
    const stuckOrders = [];
    /** @type {object[]} */
    const readySample = [];

    for (const o of activeOrders) {
      const st = String(o.status || "").toUpperCase();
      if (st === "PRODUCTION_READY") nReady += 1;
      if (st === "PRINTING") nPrint += 1;
      if (st === "QC") nQc += 1;

      const stuckReasons = computeStuckReasons(o);
      if (stuckReasons.length) {
        stuckOrders.push({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          status: o.status,
          stuckReasons,
          nextAction: o.nextAction || null,
          lineItemsSummary: summarizeLineItems(o.lineItems),
        });
      } else if (st === "PRODUCTION_READY" && readySample.length < 8) {
        readySample.push({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          status: o.status,
          nextAction: o.nextAction || null,
          lineItemsSummary: summarizeLineItems(o.lineItems),
        });
      }
    }

    return {
      ok: true,
      stuckOrders: stuckOrders.slice(0, 25),
      buckets: {
        PRODUCTION_READY: nReady,
        PRINTING: nPrint,
        QC: nQc,
        STUCK: stuckOrders.length,
      },
      readySample,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stuckOrders: [],
      buckets: { PRODUCTION_READY: 0, PRINTING: 0, QC: 0, STUCK: 0 },
      readySample: [],
    };
  }
}

async function getCommsDigestSlice() {
  const prisma = getPrisma();
  if (!prisma || !prisma.communicationApproval) {
    return { ok: false, commsToApprove: [], warning: "comms_prisma_unavailable" };
  }
  try {
    const rows = await prisma.communicationApproval.findMany({
      where: { status: { in: ["DRAFT", "PENDING"] } },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    const commsToApprove = rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      type: r.messageType || "GENERAL_UPDATE",
      subject: r.subject,
      status: r.status,
      preview:
        typeof r.textBody === "string" && r.textBody.length > 200
          ? r.textBody.slice(0, 200) + "…"
          : r.textBody || "",
    }));
    return { ok: true, commsToApprove };
  } catch (e) {
    return {
      ok: false,
      commsToApprove: [],
      warning: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * @param {{ refreshAi?: boolean }} opts
 */
async function buildDailyDigest(opts) {
  const warnings = /** @type {string[]} */ ([]);
  const date = digestNYKey();
  const timestamp = new Date().toISOString();

  /** @type {object|null} */
  let owner = null;
  try {
    const { buildOwnerSummary } = require("./ownerSummary.service");
    owner = await buildOwnerSummary();
  } catch (e) {
    warnings.push("owner_summary:" + (e instanceof Error ? e.message : String(e)));
  }

  /** AI brief (optional) */
  let aiMode = "skipped";
  let aiHeadline = "";
  /** @type {string[]} */
  let aiPriorities = [];
  try {
    const { getOperatorBrief } = require("./aiOperatorBrain.service");
    const brief = await getOperatorBrief({ refresh: !!(opts && opts.refreshAi) });
    if (brief && brief.ok && brief.brief) {
      aiMode = brief.mode || "fallback";
      aiHeadline = String(brief.brief.headline || "").trim();
      aiPriorities = Array.isArray(brief.brief.priorities)
        ? brief.brief.priorities.map(String).filter(Boolean)
        : [];
    }
  } catch (e) {
    warnings.push("ai_brief:" + (e instanceof Error ? e.message : String(e)));
  }

  const prod = await getProductionDigestSlice();
  if (!prod.ok && prod.error) warnings.push("production:" + prod.error);

  /** @type {object|null} */
  let salesBrief = null;
  try {
    const salesEng = require("./salesOpportunityEngine.service");
    salesBrief = await salesEng.buildSalesBrief();
  } catch (e) {
    warnings.push("sales_brief:" + (e instanceof Error ? e.message : String(e)));
  }

  const comms = await getCommsDigestSlice();
  if (comms.warning) warnings.push("comms:" + comms.warning);

  /** @type {object|null} */
  let cashflowSnapshot = null;
  try {
    const { buildCashflowSnapshot } = require("./cashflowSentinel.service");
    cashflowSnapshot = buildCashflowSnapshot();
  } catch (e) {
    warnings.push("cashflow:" + (e instanceof Error ? e.message : String(e)));
    cashflowSnapshot = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const billsDueToday =
    cashflowSnapshot && cashflowSnapshot.ok ? cashflowSnapshot.billsDueToday || [] : [];
  const billsDue7d =
    cashflowSnapshot && cashflowSnapshot.ok ? cashflowSnapshot.billsDue7d || [] : [];
  const overdueObligations =
    cashflowSnapshot && cashflowSnapshot.ok ? cashflowSnapshot.overdueObligations || [] : [];
  const safeToSpend =
    cashflowSnapshot && cashflowSnapshot.ok ? Number(cashflowSnapshot.safeToSpend || 0) : 0;
  const recommendedMoneyMoves =
    cashflowSnapshot && cashflowSnapshot.ok ? cashflowSnapshot.recommendedMoneyMoves || [] : [];

  /** @type {object|null} */
  let fulfillment = null;
  try {
    const fe = require("./fulfillmentEngine.service");
    fulfillment = await fe.buildFulfillmentQueuePayload();
  } catch (e) {
    warnings.push("fulfillment:" + (e instanceof Error ? e.message : String(e)));
  }

  let sig = null;
  try {
    const { collectOwnerSignals } = require("./ownerSummary.service");
    sig = await collectOwnerSignals();
  } catch (_e) {
    sig = null;
  }

  const cash = owner && owner.cash ? owner.cash : {};
  const production = owner && owner.production ? owner.production : {};
  const cashFocus = [];
  if (Number(cash.ordersAwaitingDeposit) > 0) {
    cashFocus.push(`${cash.ordersAwaitingDeposit} order(s) awaiting deposit — cash gate`);
  }
  if (Number(cash.balanceDue) > 0.02) {
    cashFocus.push(`Estimated open balance due (sampled): $${Number(cash.balanceDue).toFixed(0)}`);
  }
  if (Number(cash.depositPaidToday) > 0) {
    cashFocus.push(`Deposits recorded today: ${cash.depositPaidToday}`);
  }
  if (cashflowSnapshot && cashflowSnapshot.ok) {
    cashFocus.push(
      `Sentinel: on hand ${cashflowSnapshot.cashOnHandUsd} · obligations 7d ${cashflowSnapshot.obligations7dUsd} · safe ${cashflowSnapshot.safeToSpendUsd}`
    );
    if ((cashflowSnapshot.overdueTotal || 0) > 0) {
      cashFocus.push(`Overdue obligations: ${cashflowSnapshot.overdueTotalUsd} — open /cashflow.html`);
    }
  }
  if (!cashFocus.length) cashFocus.push("No urgent cash flags from owner summary.");

  const productionFocus = [];
  if (prod.buckets) {
    productionFocus.push(
      `Board: ${prod.buckets.PRODUCTION_READY} ready · ${prod.buckets.PRINTING} printing · ${prod.buckets.QC} QC · ${prod.buckets.STUCK} stuck signals`
    );
  }
  if (Number(production.stuck) > 0) {
    productionFocus.push(`Owner sticky count: ${production.stuck} job(s) with blockers/stale signals`);
  }
  if (prod.readySample && prod.readySample.length) {
    productionFocus.push(
      `Move today: ${prod.readySample.length} PRODUCTION_READY sample — open production board for assignments`
    );
  }

  const stuckOrders = prod.stuckOrders || [];

  const commsToApprove = comms.commsToApprove || [];

  const salesActions = [];
  if (salesBrief && Array.isArray(salesBrief.recommendedActions)) {
    for (const s of salesBrief.recommendedActions) {
      if (typeof s === "string" && s.trim()) salesActions.push(s.trim());
    }
  }
  if (salesBrief && Array.isArray(salesBrief.todayFocus)) {
    for (const s of salesBrief.todayFocus) {
      if (typeof s === "string" && s.trim()) salesActions.push(s.trim());
    }
  }
  const salesDedup = [];
  const seenSales = new Set();
  for (const s of salesActions) {
    if (seenSales.has(s)) continue;
    seenSales.add(s);
    salesDedup.push(s);
  }

  const fulfillmentActions = [];
  if (fulfillment && fulfillment.metrics) {
    const m = fulfillment.metrics;
    if (m.needsReview > 0) fulfillmentActions.push(`${m.needsReview} fulfillment row(s) need review (/fulfillment.html)`);
    if (m.pickupReady > 0) fulfillmentActions.push(`${m.pickupReady} pickup-ready — approve comms if needed`);
    if (m.shippingStaged > 0)
      fulfillmentActions.push(`${m.shippingStaged} ship/local staged — Pirate Ship drafts`);
  }
  if (!fulfillmentActions.length) fulfillmentActions.push("Fulfillment queue quiet or unavailable.");

  const risks = [];
  if (owner && Array.isArray(owner.risks)) {
    for (const r of owner.risks) {
      if (typeof r === "string" && r.trim()) risks.push(r.trim());
    }
  }
  if (commsToApprove.length > 10) {
    risks.push(`${commsToApprove.length} customer messages need approval`);
  }

  let purchasingSnapshot = {
    needsApproval: 0,
    blocked: 0,
    orderedNotReceived: 0,
    estimatedSpendPending: 0,
  };
  /** @type {string[]} */
  let purchasingFocus = [];
  try {
    const { ownerPurchasingSnapshot } = require("./purchasingEngine.service");
    const pStore = require("./purchasing.store");
    purchasingSnapshot = ownerPurchasingSnapshot();
    for (const p of pStore.listPlans()) {
      const st = String(p.status || "").toUpperCase();
      const label = `${p.customerName || "?"} · #${p.orderNumber || String(p.orderId || "").slice(0, 8)}`;
      if (st === "NEEDS_APPROVAL" || st === "DRAFT") {
        purchasingFocus.push(`Needs approval: ${label} · ~$${((Number(p.totalCost) || 0) / 100).toFixed(2)} · ${p.vendorName || "vendor TBD"}`);
      }
      if (st === "BLOCKED") {
        purchasingFocus.push(`Blocked: ${label} · ${p.blockedReason || "reason in UI"}`);
      }
      if (st === "ORDERED" || st === "PARTIALLY_RECEIVED") {
        purchasingFocus.push(`Ordered, awaiting receiving: ${label}`);
      }
    }
    if (!purchasingFocus.length) purchasingFocus.push("No open purchase plans — /purchasing.html");
  } catch (_pe) {
    purchasingFocus.push("Purchasing snapshot unavailable");
  }

  let QcSnap = { pending: 0, failed: 0, reprints: 0 };
  /** @type {string[]} */
  let qcFocus = [];
  try {
    const qEng = require("./qcEngine.service");
    const qStore = require("./qc.store");
    QcSnap = qEng.ownerQcSnapshot();
    for (const c of qStore.listChecks()) {
      const st = String(c.status || "").toUpperCase();
      const label = `${c.customerName || "?"} · #${c.orderNumber || String(c.orderId || "").slice(0, 8)}`;
      if (st === "FAIL") qcFocus.push(`QC failed: ${label} · defects ${(c.defects && c.defects.length) || 0}`);
      if (st === "PENDING") qcFocus.push(`QC pending: ${label}`);
    }
    for (const rp of qStore.listReprintPlans()) {
      if (String(rp.status || "").toUpperCase() === "OPEN" && rp.needsReprint) {
        qcFocus.push(`Reprint required: order ${String(rp.orderId || "").slice(0, 8)}… · blocked=${!!rp.productionBlocked}`);
      }
    }
    if (!qcFocus.length) qcFocus.push("QC / reprint queue quiet — /qc.html");
  } catch (_qe) {
    qcFocus.push("QC snapshot unavailable");
  }

  /** Top 5 priorities — cash first */
  const topPriorities = [];
  function addP(s) {
    const x = String(s || "").trim();
    if (!x || topPriorities.includes(x)) return;
    if (topPriorities.length >= 5) return;
    topPriorities.push(x);
  }

  if (Number(cash.ordersAwaitingDeposit) > 0) {
    addP(`Cash: clear ${cash.ordersAwaitingDeposit} order(s) awaiting deposit`);
  }
  if (sig && sig.stuckWithoutDeposit > 0) {
    addP(`Resolve ${sig.stuckWithoutDeposit} active job(s) missing deposit timestamp`);
  }
  if (cashflowSnapshot && cashflowSnapshot.ok) {
    const od = cashflowSnapshot.overdue || [];
    if (od.length || (cashflowSnapshot.overdueTotal || 0) > 0) {
      addP(
        `Cashflow: ${od.length || overdueObligations.length} overdue bill(s) · ${cashflowSnapshot.overdueTotalUsd} — open /cashflow.html`
      );
    }
    for (const b of billsDueToday.slice(0, 2)) {
      addP(`Cashflow due today: ${b.name} (${b.amountUsd})`);
    }
    if (
      (cashflowSnapshot.obligations7d || 0) > (cashflowSnapshot.cashOnHand || 0) &&
      (cashflowSnapshot.obligations7d || 0) > 0
    ) {
      addP(
        `Cashflow: 7-day obligations (${cashflowSnapshot.obligations7dUsd}) exceed recorded cash (${cashflowSnapshot.cashOnHandUsd}) — protect runway`
      );
    }
    if ((cashflowSnapshot.shortfallCents || 0) > 0) {
      addP(`Cashflow: runway shortfall ${cashflowSnapshot.shortfallUsd} after 14-day obligations`);
    }
  }
  if ((purchasingSnapshot.needsApproval || 0) > 0) {
    addP(`Purchasing: ${purchasingSnapshot.needsApproval} plan(s) need approval — /purchasing.html`);
  }
  if ((purchasingSnapshot.blocked || 0) > 0) {
    addP(`Purchasing: ${purchasingSnapshot.blocked} blank plan(s) blocked — fund deposits before buying blanks`);
  }
  if ((purchasingSnapshot.orderedNotReceived || 0) > 0) {
    addP(`Purchasing: ${purchasingSnapshot.orderedNotReceived} blank order(s) not received`);
  }
  if ((QcSnap.failed || 0) > 0) {
    addP(`QC: ${QcSnap.failed} order(s) failed inspection — /qc.html`);
  }
  if ((QcSnap.reprints || 0) > 0) {
    addP(`Reprints: ${QcSnap.reprints} open reprint plan(s) — inventory / purchasing`);
  }
  if (stuckOrders.length) {
    addP(`Unstick ${stuckOrders.length} production job(s) — open production board`);
  }
  if (commsToApprove.length) {
    addP(`Approve ${commsToApprove.length} customer message draft(s) in Comms`);
  }
  if (salesDedup.length) addP(`Sales: ${salesDedup[0]}`);
  if (fulfillment && fulfillment.metrics && fulfillment.metrics.needsReview > 0) {
    addP(`Fulfillment: ${fulfillment.metrics.needsReview} need method/address review`);
  }
  for (const p of aiPriorities) addP(p);
  if (owner && Array.isArray(owner.nextActions)) {
    for (const a of owner.nextActions) {
      if (a && a.label) addP(a.label);
    }
  }
  if (topPriorities.length < 3 && aiHeadline) addP(aiHeadline);

  const headline =
    aiHeadline ||
    (owner && owner.headline) ||
    (risks[0] ? risks[0] : "Daily control brief — review priorities below");

  const recommendedSchedule = [
    "06:30 — Scan this digest + cash tiles",
    "07:00 — Production board: deposits + stuck jobs",
    "08:30 — Comms approvals (no auto-send)",
    "10:00 — Top sales opportunities + fulfillment staging",
    "15:00 — Re-check operator status before close",
  ];

  const digest = {
    ok: true,
    date,
    headline: String(headline).slice(0, 280),
    cashFocus: cashFocus.slice(0, 12),
    productionFocus: productionFocus.slice(0, 12),
    stuckOrders,
    commsToApprove: commsToApprove.slice(0, 35),
    salesActions: salesDedup.slice(0, 12),
    fulfillmentActions: fulfillmentActions.slice(0, 12),
    topPriorities: topPriorities.slice(0, 5),
    risks: risks.slice(0, 20),
    recommendedSchedule,
    timestamp,
    meta: {
      aiBriefMode: aiMode,
      warnings: warnings.length ? warnings : undefined,
      fulfillmentMetrics: fulfillment && fulfillment.metrics ? fulfillment.metrics : undefined,
      salesHeadline: salesBrief && salesBrief.headline ? String(salesBrief.headline).slice(0, 200) : undefined,
      cashflowDateNY: cashflowSnapshot && cashflowSnapshot.dateNY ? cashflowSnapshot.dateNY : undefined,
    },
    cashflowSnapshot,
    billsDueToday,
    billsDue7d,
    overdueObligations,
    safeToSpend,
    recommendedMoneyMoves,
    purchasingFocus: purchasingFocus.slice(0, 16),
    purchasing: purchasingSnapshot,
    qcFocus: qcFocus.slice(0, 16),
    qc: QcSnap,
  };

  return digest;
}

function formatDigestEmailBody(d) {
  const lines = [];
  lines.push(`Cheeky OS — Daily digest (${d.date})`);
  lines.push("");
  lines.push(`Headline: ${d.headline}`);
  lines.push("");
  lines.push("Top priorities:");
  for (const p of d.topPriorities || []) lines.push(`- ${p}`);
  lines.push("");
  lines.push("Cash:");
  for (const p of d.cashFocus || []) lines.push(`- ${p}`);
  lines.push("");
  if (d.cashflowSnapshot && d.cashflowSnapshot.ok) {
    const c = d.cashflowSnapshot;
    lines.push("Cashflow sentinel:");
    lines.push(
      `- On hand: ${c.cashOnHandUsd} · Income 7d: ${c.expectedIncome7dUsd} · Obligations 7d/14d: ${c.obligations7dUsd} / ${c.obligations14dUsd}`
    );
    lines.push(`- Overdue: ${c.overdueTotalUsd} · Safe to spend (capped): ${c.safeToSpendUsd}`);
    lines.push("Recommended moves:");
    for (const m of d.recommendedMoneyMoves || []) lines.push(`- ${m}`);
    lines.push("");
  }
  if (d.purchasingFocus && d.purchasingFocus.length) {
    lines.push("Purchasing:");
    for (const p of d.purchasingFocus) lines.push(`- ${p}`);
    lines.push("");
  }
  if (d.qcFocus && d.qcFocus.length) {
    lines.push("Quality control:");
    for (const p of d.qcFocus) lines.push(`- ${p}`);
    lines.push("");
  }
  lines.push("Production:");
  for (const p of d.productionFocus || []) lines.push(`- ${p}`);
  lines.push("");
  lines.push(`Stuck orders (sample ${(d.stuckOrders || []).length}):`);
  for (const o of (d.stuckOrders || []).slice(0, 15)) {
    lines.push(`- ${o.customerName || "?"} · ${o.status} · ${(o.stuckReasons || []).join(", ")} · ${o.id}`);
  }
  lines.push("");
  lines.push("Comms awaiting approval:");
  for (const c of (d.commsToApprove || []).slice(0, 15)) {
    lines.push(`- ${c.subject || c.type} · order ${c.orderId || "—"}`);
  }
  lines.push("");
  lines.push("Sales actions:");
  for (const p of d.salesActions || []) lines.push(`- ${p}`);
  lines.push("");
  lines.push("Fulfillment:");
  for (const p of d.fulfillmentActions || []) lines.push(`- ${p}`);
  lines.push("");
  lines.push("Risks:");
  for (const p of d.risks || []) lines.push(`- ${p}`);
  lines.push("");
  lines.push("—");
  lines.push("Draft/preview only unless you enabled auto-send. Open /digest.html for full JSON.");
  return lines.join("\n");
}

/**
 * @param {object} digest - from buildDailyDigest
 */
async function maybeEmailDigest(digest) {
  const auto = truthyEnv("CHEEKY_DAILY_DIGEST_AUTO_SEND");
  const to = String(process.env.CHEEKY_DAILY_DIGEST_TO || "").trim();
  if (!auto) {
    console.log("[digest] DAILY DIGEST EMAIL SKIPPED auto_send=false");
    return { skipped: true, reason: "auto_send_false" };
  }
  if (!to) {
    console.log("[digest] DAILY DIGEST EMAIL SKIPPED no recipient");
    return { skipped: true, reason: "no_recipient" };
  }
  try {
    const { sendEmail } = require("./email.send.service");
    const subject = `[Cheeky OS] Daily digest ${digest.date}`;
    const body = formatDigestEmailBody(digest);
    const out = await sendEmail({ to, subject, body });
    if (out && out.success) {
      console.log("[digest] DAILY DIGEST SENT");
      return { skipped: false, sent: true, messageId: out.messageId || null, mode: out.mode };
    }
    console.warn("[digest] email send failed:", out && out.error ? out.error : out);
    return { skipped: false, sent: false, error: out && out.error ? out.error : "send_failed" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[digest] email error:", msg);
    return { skipped: false, sent: false, error: msg };
  }
}

/**
 * @param {{ persist?: boolean, refreshAi?: boolean }} opts
 */
async function generateAndStoreDailyDigest(opts) {
  const persist = opts && opts.persist === false ? false : true;
  const refreshAi = !!(opts && opts.refreshAi);

  const payload = await buildDailyDigest({ refreshAi });
  const mode = payload.meta && payload.meta.aiBriefMode ? String(payload.meta.aiBriefMode) : "deterministic";

  let saved = null;
  if (persist) {
    saved = store.saveEntry({
      digestDate: payload.date,
      headline: payload.headline,
      payload,
      mode,
      sentAt: null,
      topPriorityCount: (payload.topPriorities || []).length,
      riskCount: (payload.risks || []).length,
    });
    console.log("[digest] DAILY DIGEST GENERATED");
  }

  const emailResult = await maybeEmailDigest(payload);
  if (emailResult.sent && saved && saved.id) {
    store.updateSentAt(saved.id, new Date().toISOString());
  }

  return {
    ok: true,
    persisted: persist,
    entryId: saved ? saved.id : null,
    digest: payload,
    email: emailResult,
  };
}

module.exports = {
  buildDailyDigest,
  generateAndStoreDailyDigest,
  maybeEmailDigest,
  formatDigestEmailBody,
  getProductionDigestSlice,
  getCommsDigestSlice,
};
