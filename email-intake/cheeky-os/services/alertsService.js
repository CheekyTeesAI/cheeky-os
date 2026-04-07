/**
 * Bundle 7 — owner alerts (reuses followups + production reads; no extra Square loops).
 */

const { getRevenueFollowups } = require("./revenueFollowups");
const { getReactivationBuckets } = require("./reactivationBuckets");
const { scoreFollowupOpportunities } = require("./followupScoringService");
const { buildNextActionWithPriority } = require("./nextAction");
const {
  getActiveProductionOrdersForAlerts,
  sortOrdersForQueue,
  toQueueItem,
} = require("./orderStatusEngine");

function emptyAlerts() {
  return {
    urgentFollowups: [],
    productionAlerts: [],
    cashAlerts: [],
    summary: {
      urgentFollowupCount: 0,
      productionAlertCount: 0,
      cashAlertCount: 0,
    },
  };
}

function buildUrgentFollowups(followups) {
  const unpaid = Array.isArray(followups && followups.unpaidInvoices)
    ? followups.unpaidInvoices
    : [];
  const stale = Array.isArray(followups && followups.staleEstimates)
    ? followups.staleEstimates
    : [];
  const scored = scoreFollowupOpportunities(unpaid, stale);
  return scored
    .filter((s) => s.priority === "high" || s.priority === "critical")
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      type: s.type,
      customerName: s.customerName,
      phone: s.phone,
      email: s.email,
      amount: s.amount,
      daysOld: s.daysOld,
      priority: s.priority,
      reason: s.reason,
    }));
}

function parseMoney(v) {
  const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function buildCashAlerts(followups) {
  const unpaid = Array.isArray(followups && followups.unpaidInvoices)
    ? followups.unpaidInvoices
    : [];
  const stale = Array.isArray(followups && followups.staleEstimates)
    ? followups.staleEstimates
    : [];

  const inv = unpaid
    .filter((i) => (Number(i.daysPastDue) || 0) > 7)
    .map((i) => ({
      id: String(i.id || ""),
      type: "invoice",
      customerName: i.customerName || "",
      phone: i.phone || "",
      email: i.email || "",
      amount: parseMoney(i.amount),
      daysOld: Number(i.daysPastDue) || 0,
    }));

  const est = stale
    .filter((e) => (Number(e.daysOld) || 0) > 7)
    .map((e) => ({
      id: String(e.id || ""),
      type: "estimate",
      customerName: e.customerName || "",
      phone: e.phone || "",
      email: e.email || "",
      amount: parseMoney(e.amount),
      daysOld: Number(e.daysOld) || 0,
    }));

  const combined = [...inv, ...est];
  combined.sort((a, b) => b.daysOld - a.daysOld);
  return combined.slice(0, 5);
}

function classifyProductionRow(row) {
  const due = row.dueDate ? String(row.dueDate).trim() : "";
  const createdAt = row.createdAt ? new Date(row.createdAt) : null;
  const createdOk = createdAt && Number.isFinite(createdAt.getTime());
  const daysInShop = createdOk
    ? Math.max(
        0,
        Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000))
      )
    : 0;

  const base = () => ({
    orderId: row.id,
    customerName: row.customerName || "",
    product: row.product || "",
    quantity: row.quantity ?? 0,
    printType: row.printType || "",
    dueDate: due,
    status: row.status || "",
  });

  const isoLike =
    /^\d{4}-\d{2}-\d{2}/.test(due) || (due.includes("T") && due.length >= 10);
  if (isoLike) {
    const t = Date.parse(due);
    if (Number.isFinite(t)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDay = new Date(t);
      dueDay.setHours(0, 0, 0, 0);
      const diff = Math.round(
        (dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)
      );
      if (diff > 5) {
        return { kind: "far", row };
      }
      if (diff < 0) {
        return {
          kind: "hit",
          item: {
            ...base(),
            urgencyLabel: "CRITICAL",
            alertReason: "Past due",
            _sort: 300 + Math.abs(diff),
          },
        };
      }
      if (diff <= 2) {
        return {
          kind: "hit",
          item: {
            ...base(),
            urgencyLabel: "HIGH",
            alertReason: "Due soon",
            _sort: 200 - diff,
          },
        };
      }
      return {
        kind: "hit",
        item: {
          ...base(),
          urgencyLabel: "ATTENTION",
          alertReason: "Due this week",
          _sort: 100 - diff,
        },
      };
    }
  }

  return {
    kind: "hit",
    item: {
      ...base(),
      urgencyLabel: daysInShop >= 5 ? "HIGH" : "ATTENTION",
      alertReason: "Needs attention",
      _sort: 50 + daysInShop,
    },
  };
}

function buildProductionAlerts(prodRows) {
  const rows = Array.isArray(prodRows) ? prodRows : [];
  const hits = [];
  const far = [];
  for (const row of rows) {
    const c = classifyProductionRow(row);
    if (c.kind === "far") far.push(row);
    else hits.push(c.item);
  }
  hits.sort((a, b) => (b._sort || 0) - (a._sort || 0));
  const out = [];
  for (const h of hits) {
    if (out.length >= 5) break;
    const { _sort, ...rest } = h;
    out.push(rest);
  }
  far.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  for (const row of far) {
    if (out.length >= 5) break;
    const ca = row.createdAt ? new Date(row.createdAt) : null;
    const daysInShop =
      ca && Number.isFinite(ca.getTime())
        ? Math.max(
            0,
            Math.floor((Date.now() - ca.getTime()) / (24 * 60 * 60 * 1000))
          )
        : 0;
    out.push({
      orderId: row.id,
      customerName: row.customerName || "",
      product: row.product || "",
      quantity: row.quantity ?? 0,
      printType: row.printType || "",
      dueDate: row.dueDate || "",
      status: row.status || "",
      urgencyLabel: daysInShop >= 7 ? "HIGH" : "ATTENTION",
      alertReason: "Needs attention",
    });
  }
  return out;
}

function assembleAlerts(followups, prodRows) {
  const urgentFollowups = buildUrgentFollowups(followups);
  const cashAlerts = buildCashAlerts(followups);
  const productionAlerts = buildProductionAlerts(prodRows);
  return {
    urgentFollowups,
    productionAlerts,
    cashAlerts,
    summary: {
      urgentFollowupCount: urgentFollowups.length,
      productionAlertCount: productionAlerts.length,
      cashAlertCount: cashAlerts.length,
    },
  };
}

function groupProductionQueueFromDetailed(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const ready = sortOrdersForQueue(list.filter((r) => r.status === "READY"));
  const printing = sortOrdersForQueue(
    list.filter((r) => r.status === "PRINTING")
  );
  const qc = sortOrdersForQueue(list.filter((r) => r.status === "QC"));
  return {
    ready: ready.slice(0, 25).map(toQueueItem),
    printing: printing.slice(0, 25).map(toQueueItem),
    qc: qc.slice(0, 25).map(toQueueItem),
  };
}

async function getAlertsToday() {
  try {
    const [f, prod] = await Promise.all([
      getRevenueFollowups(),
      getActiveProductionOrdersForAlerts(),
    ]);
    return assembleAlerts(f, prod);
  } catch (err) {
    console.error("[alertsService] getAlertsToday:", err.message || err);
    return emptyAlerts();
  }
}

const FALLBACK_NEXT = {
  action: "No urgent sales actions — proceed to production",
  type: "production",
  target: { name: "", phone: "", email: "", id: "" },
  reason: "Unable to load panel",
};

/**
 * Single parallel fetch for /ops/today (one Square followups + reactivation + SQLite production).
 */
async function getOpsCommandPanelPayload() {
  try {
    const [f, buckets, prod] = await Promise.all([
      getRevenueFollowups(),
      getReactivationBuckets(),
      getActiveProductionOrdersForAlerts(),
    ]);
    return {
      alerts: assembleAlerts(f, prod),
      next: buildNextActionWithPriority(f, buckets),
      queue: groupProductionQueueFromDetailed(prod),
    };
  } catch (err) {
    console.error("[alertsService] getOpsCommandPanelPayload:", err.message || err);
    return {
      alerts: emptyAlerts(),
      next: FALLBACK_NEXT,
      queue: { ready: [], printing: [], qc: [] },
    };
  }
}

module.exports = {
  getAlertsToday,
  getOpsCommandPanelPayload,
  assembleAlerts,
  emptyAlerts,
};
