/**
 * Bundle 14 — aggregate automation suggestions across recent orders + follow-ups.
 */

const { getPrisma } = require("../marketing/prisma-client");
const { getAutoFollowupsResponse } = require("./autoFollowupsService");
const { getMemory } = require("./orderMemoryService");
const { analyzeJob, inferProductType } = require("./jobIntelligenceService");
const { suggestActions } = require("./actionSuggestionService");
const { tryGarmentDigestSnapshot } = require("./garmentDigestBridge");

const PRI = { critical: 0, high: 1, medium: 2, low: 3 };

function priVal(p) {
  return PRI[String(p || "").toLowerCase()] ?? 3;
}

function normalizeName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Pull amount/daysOld from scored follow-ups when names loosely match (for message prep).
 * @param {object[]} followups
 * @param {string} customerName
 * @returns {{ amount: number, daysOld: number }}
 */
function followupMetaForCustomer(followups, customerName) {
  const c = normalizeName(customerName);
  if (!c) return { amount: 0, daysOld: 0 };
  const list = Array.isArray(followups) ? followups : [];
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const fn = normalizeName(/** @type {{ customerName?: string }} */ (f).customerName);
    if (!fn) continue;
    if (c === fn || c.includes(fn) || fn.includes(c)) {
      return {
        amount: Number(/** @type {{ amount?: unknown }} */ (f).amount) || 0,
        daysOld: Number(/** @type {{ daysOld?: unknown }} */ (f).daysOld) || 0,
      };
    }
  }
  return { amount: 0, daysOld: 0 };
}

function daysSinceCreated(createdAt) {
  if (!createdAt) return 0;
  const d = new Date(createdAt);
  const t = d.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

async function fetchActiveOrders(limit) {
  const prisma = getPrisma();
  if (!prisma || !prisma.captureOrder) return [];
  const n = Math.min(15, Math.max(1, Number(limit) || 12));
  try {
    return await prisma.captureOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: n,
    });
  } catch (err) {
    console.error("[automationActions] orders:", err.message || err);
    return [];
  }
}

function dedupeFlattened(actions) {
  const best = new Map();
  for (const a of actions) {
    const oid = String(a.orderId || "");
    const typ = String(a.type || "");
    const k = `${oid}|${typ}`;
    const cur = best.get(k);
    if (!cur || priVal(a.priority) < priVal(cur.priority)) best.set(k, a);
  }
  return [...best.values()];
}

/**
 * @param {number} [maxOut]
 * @returns {Promise<{ actions: object[] }>}
 */
async function collectAutomationActions(maxOut = 10) {
  const cap = Math.min(15, Math.max(1, Number(maxOut) || 10));
  const [auto, orders] = await Promise.all([
    getAutoFollowupsResponse(),
    fetchActiveOrders(12),
  ]);

  const followups = auto.topActions || [];
  const flat = [];

  for (const order of orders) {
    const mem = getMemory(order);
    const intelligence = analyzeJob({
      customerName: order.customerName,
      quantity: order.quantity,
      productType: inferProductType("", order.product),
      product: order.product,
      printType: order.printType,
      dueText: order.dueDate || "",
      status: order.status,
      paymentStatus: order.paymentStatus || "",
      memory: {
        notes: mem.notes,
        decisions: mem.decisions,
        flags: mem.flags,
        history: mem.history,
      },
      rawText: String(order.paymentNotes || ""),
    });

    const { actions } = suggestActions({
      order,
      intelligence,
      followups,
    });

    const orderAge = daysSinceCreated(order.createdAt);

    for (const a of actions) {
      const cn =
        (a.target && a.target.customerName) || order.customerName || "";
      const rowMeta = { ...followupMetaForCustomer(followups, cn) };
      let amount = rowMeta.amount;
      let daysOld = rowMeta.daysOld;
      const typ = String(a.type || "").toLowerCase();
      if (typ === "invoice" && (!amount || amount <= 0)) {
        amount = Number(order.balanceDue) || 0;
      }
      if (!daysOld || daysOld <= 0) daysOld = orderAge;

      flat.push({
        type: a.type,
        label: a.label,
        priority: a.priority,
        customerName: cn,
        orderId: (a.target && a.target.orderId) || order.id || "",
        reason: a.reason || "",
        amount,
        daysOld,
      });
    }
  }

  const garmentSnap = await tryGarmentDigestSnapshot();
  if (garmentSnap && garmentSnap.garmentOrdersPending > 0) {
    flat.push({
      type: "garments",
      label: `Place ${garmentSnap.garmentOrdersPending} garment order(s)`,
      priority: "high",
      customerName: "—",
      orderId: "",
      reason: "GET /api/operator/garment-orders",
      amount: 0,
      daysOld: 0,
    });
  }
  if (garmentSnap && garmentSnap.garmentOrdersOrderedAwaitingReceive > 0) {
    flat.push({
      type: "garments_receive",
      label: `Receive ${garmentSnap.garmentOrdersOrderedAwaitingReceive} garment shipment(s)`,
      priority: "medium",
      customerName: "—",
      orderId: "",
      reason: "Garments ordered but not marked received",
      amount: 0,
      daysOld: 0,
    });
  }
  if (garmentSnap && garmentSnap.productionReadyMissingGarmentTask > 0) {
    flat.push({
      type: "garments_gap",
      label: `Fix ${garmentSnap.productionReadyMissingGarmentTask} order(s) missing garment task`,
      priority: "high",
      customerName: "—",
      orderId: "",
      reason: "Data check — deposit cleared but no GARMENT_ORDER task",
      amount: 0,
      daysOld: 0,
    });
  }

  const deduped = dedupeFlattened(flat);
  deduped.sort((x, y) => priVal(x.priority) - priVal(y.priority));
  return { actions: deduped.slice(0, cap) };
}

module.exports = { collectAutomationActions, priVal };
