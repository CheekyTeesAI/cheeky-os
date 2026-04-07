/**
 * Bundle 14 — aggregate automation suggestions across recent orders + follow-ups.
 */

const { getPrisma } = require("../marketing/prisma-client");
const { getAutoFollowupsResponse } = require("./autoFollowupsService");
const { getMemory } = require("./orderMemoryService");
const { analyzeJob, inferProductType } = require("./jobIntelligenceService");
const { suggestActions } = require("./actionSuggestionService");

const PRI = { critical: 0, high: 1, medium: 2, low: 3 };

function priVal(p) {
  return PRI[String(p || "").toLowerCase()] ?? 3;
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

    for (const a of actions) {
      flat.push({
        type: a.type,
        label: a.label,
        priority: a.priority,
        customerName:
          (a.target && a.target.customerName) || order.customerName || "",
        orderId: (a.target && a.target.orderId) || order.id || "",
        reason: a.reason || "",
      });
    }
  }

  const deduped = dedupeFlattened(flat);
  deduped.sort((x, y) => priVal(x.priority) - priVal(y.priority));
  return { actions: deduped.slice(0, cap) };
}

module.exports = { collectAutomationActions, priVal };
