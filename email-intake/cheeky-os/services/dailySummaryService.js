/**
 * Bundle 17 — today’s snapshot counts + highlights (lightweight, reuses existing services).
 */

const { getAutoFollowupsResponse } = require("./autoFollowupsService");
const { collectAutomationActions } = require("./automationActionsService");
const { getPrisma } = require("../marketing/prisma-client");
const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("./paymentGateService");
const { getMemory } = require("./orderMemoryService");
const { analyzeJob, inferProductType } = require("./jobIntelligenceService");
const { tryGarmentDigestSnapshot } = require("./garmentDigestBridge");

const ORDER_LIMIT = 25;

function emptySummary() {
  return {
    counts: {
      urgentFollowups: 0,
      blockedOrders: 0,
      readyToPrint: 0,
      inProduction: 0,
      highRiskOrders: 0,
      garmentOrdersPending: 0,
      garmentOrdersOrderedAwaitingReceive: 0,
      productionReadyMissingGarmentTask: 0,
      unpaidOrdersNeedingReminders: 0,
      proofsNotSent: 0,
      proofsAwaitingApproval: 0,
      pickupReadyNotNotified: 0,
      commsStubbedLast24h: 0,
    },
    highlights: {
      topAction: "",
      topCustomer: "",
      biggestOpportunity: "",
      customerCommsDigest: "",
    },
  };
}

/**
 * @returns {Promise<object[]>}
 */
async function fetchRecentOrders() {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) return [];
  try {
    return await prisma.captureOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: ORDER_LIMIT,
    });
  } catch (err) {
    console.error("[dailySummary] orders:", err.message || err);
    return [];
  }
}

/**
 * @param {unknown} p
 */
function isUrgentPriority(p) {
  const x = String(p || "").toLowerCase();
  return x === "high" || x === "critical";
}

/**
 * @param {object[]} topActions
 */
function biggestOpportunityLine(topActions) {
  const list = Array.isArray(topActions) ? topActions : [];
  let best = null;
  let bestAmt = -1;
  for (const t of list) {
    if (!t || typeof t !== "object") continue;
    const amt = Number(/** @type {{ amount?: unknown }} */ (t).amount) || 0;
    if (amt > bestAmt) {
      bestAmt = amt;
      best = t;
    }
  }
  if (!best || bestAmt <= 0) return "";
  const name =
    String(/** @type {{ customerName?: string }} */ (best).customerName || "").trim() ||
    "Customer";
  return `${name} · ~$${Math.round(bestAmt)}`;
}

/**
 * @param {object[]} orders
 * @param {object} auto
 * @param {object[]} actions
 * @returns {{ counts: object, highlights: object }}
 */
function computeSummaryFromData(orders, auto, actions) {
  const out = emptySummary();
  const topActions = (auto && auto.topActions) || [];

  out.counts.urgentFollowups = topActions.filter((t) =>
    isUrgentPriority(t && t.priority)
  ).length;

  for (const o of orders) {
    const gate = evaluatePaymentGate(captureOrderToGateInput(o));
    const st = String(o.status || "")
      .trim()
      .toUpperCase();

    if (!gate.allowedToProduce && st !== "DONE") {
      out.counts.blockedOrders += 1;
    }
    if (gate.allowedToProduce && st === "READY") {
      out.counts.readyToPrint += 1;
    }
    if (st === "PRINTING" || st === "QC") {
      out.counts.inProduction += 1;
    }

    const mem = getMemory(o);
    const intelligence = analyzeJob({
      customerName: o.customerName,
      quantity: o.quantity,
      productType: inferProductType("", o.product),
      product: o.product,
      printType: o.printType,
      dueText: o.dueDate || "",
      status: o.status,
      paymentStatus: o.paymentStatus || "",
      memory: {
        notes: mem.notes,
        decisions: mem.decisions,
        flags: mem.flags,
        history: mem.history,
      },
      rawText: String(o.paymentNotes || ""),
    });
    const risk =
      intelligence &&
      intelligence.risk &&
      String(intelligence.risk.level || "").toLowerCase() === "high";
    if (risk) out.counts.highRiskOrders += 1;
  }

  const actList = Array.isArray(actions) ? actions : [];
  const top = actList[0];
  if (top && typeof top === "object") {
    const label = String(
      /** @type {{ label?: string, type?: string }} */ (top).label || ""
    ).trim();
    const typ = String(
      /** @type {{ type?: string }} */ (top).type || ""
    ).trim();
    out.highlights.topAction = label || typ || "";
    out.highlights.topCustomer = String(
      /** @type {{ customerName?: string }} */ (top).customerName || ""
    ).trim();
  }

  out.highlights.biggestOpportunity = biggestOpportunityLine(topActions);
  return out;
}

/**
 * @param {object} out
 * @param {{ garmentOrdersPending?: number, garmentOrdersOrderedAwaitingReceive?: number, productionReadyMissingGarmentTask?: number } | null} snap
 */
/**
 * @param {object} out
 * @param {{ counts?: object, summaryLine?: string } | null} comms
 */
function mergeCommsDigest(out, comms) {
  if (!comms || typeof comms !== "object") return;
  const c = comms.counts && typeof comms.counts === "object" ? comms.counts : {};
  if (typeof c.unpaidOrdersNeedingReminders === "number") {
    out.counts.unpaidOrdersNeedingReminders = c.unpaidOrdersNeedingReminders;
  }
  if (typeof c.proofsNotSent === "number") {
    out.counts.proofsNotSent = c.proofsNotSent;
  }
  if (typeof c.proofsAwaitingApproval === "number") {
    out.counts.proofsAwaitingApproval = c.proofsAwaitingApproval;
  }
  if (typeof c.pickupReadyNotNotified === "number") {
    out.counts.pickupReadyNotNotified = c.pickupReadyNotNotified;
  }
  if (typeof c.commsStubbedLast24h === "number") {
    out.counts.commsStubbedLast24h = c.commsStubbedLast24h;
  }
  const line = String(comms.summaryLine || "").trim();
  if (line) {
    out.highlights.customerCommsDigest = line;
    if (!out.highlights.topAction) {
      out.highlights.topAction = line;
    }
  }
}

function mergeGarmentDigest(out, snap) {
  if (!snap || typeof snap !== "object") return;
  if (typeof snap.garmentOrdersPending === "number") {
    out.counts.garmentOrdersPending = snap.garmentOrdersPending;
  }
  if (typeof snap.garmentOrdersOrderedAwaitingReceive === "number") {
    out.counts.garmentOrdersOrderedAwaitingReceive =
      snap.garmentOrdersOrderedAwaitingReceive;
  }
  if (typeof snap.productionReadyMissingGarmentTask === "number") {
    out.counts.productionReadyMissingGarmentTask =
      snap.productionReadyMissingGarmentTask;
  }
  const parts = [];
  const gp = Number(snap.garmentOrdersPending) || 0;
  const ga = Number(snap.garmentOrdersOrderedAwaitingReceive) || 0;
  const gm = Number(snap.productionReadyMissingGarmentTask) || 0;
  if (gp > 0) {
    parts.push(`${gp} garment order(s) to place`);
  }
  if (ga > 0) {
    parts.push(`${ga} awaiting garment receipt`);
  }
  if (gm > 0) {
    parts.push(
      `${gm} missing garment task rows`
    );
  }
  if (parts.length && !out.highlights.topAction) {
    out.highlights.topAction = parts.join(" · ");
  }
}

/**
 * @returns {Promise<{ counts: object, highlights: object }>}
 */
async function getDailySummary() {
  try {
    const [auto, autoPack, orders, garmentSnap] = await Promise.all([
      getAutoFollowupsResponse(),
      collectAutomationActions(10),
      fetchRecentOrders(),
      tryGarmentDigestSnapshot(),
    ]);
    const actions = (autoPack && autoPack.actions) || [];
    const out = computeSummaryFromData(orders, auto, actions);
    mergeGarmentDigest(out, garmentSnap);

    let commsDigest = null;
    try {
      const path = require("path");
      const mod = require(path.join(
        __dirname,
        "..",
        "..",
        "dist",
        "services",
        "customerCommsService.js"
      ));
      if (mod && typeof mod.getCustomerCommsDigest === "function") {
        commsDigest = await mod.getCustomerCommsDigest();
      }
    } catch (e) {
      /* optional — build without comms */
    }
    mergeCommsDigest(out, commsDigest);

    return out;
  } catch (err) {
    console.error("[dailySummary]", err.message || err);
    return emptySummary();
  }
}

module.exports = { getDailySummary };
