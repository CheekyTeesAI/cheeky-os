"use strict";

/**
 * Shift summaries / handoffs — read-only rollup for operator continuity.
 */

const fs = require("fs");
const path = require("path");

const helpers = require("../drafting/draftOrderHelpers");
const approvalGateService = require("../approvals/approvalGateService");
const frictionLogService = require("./frictionLogService");
const squareLiveReadService = require("../connectors/squareLiveReadService");
const taskQueue = require("../agent/taskQueue");

const STORE = "shift-handoffs.json";

function storePath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, STORE);
}

function readHandoffs() {
  const p = storePath();
  if (!fs.existsSync(p)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(j) ? j : [];
  } catch (_e) {
    return [];
  }
}

function appendHandoff(entry) {
  const arr = readHandoffs();
  arr.push(entry);
  const tmp = `${storePath()}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(arr.slice(-240), null, 2), "utf8");
  fs.renameSync(tmp, storePath());
  return entry;
}

function draftsPendingCount() {
  const root = path.join(taskQueue.DATA_DIR, "drafts");
  if (!fs.existsSync(root)) return 0;
  let n = 0;
  ["work-order", "garment-order", "follow-up"].forEach((sub) => {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) return;
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch (_e) {
      return;
    }
    files.forEach((f) => {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        if (!j.status || j.status === "pending_review") n += 1;
      } catch (_e2) {}
    });
  });
  return n;
}

async function computeShiftSummary() {
  const now = new Date();
  const prisma = helpers.getPrisma();
  /** @type {object[]} */
  let orders = [];
  if (prisma && prisma.order) {
    try {
      orders = await prisma.order.findMany({
        where: { deletedAt: null },
        take: 500,
      });
    } catch (_e) {
      orders = [];
    }
  }

  const completed = orders.filter((o) => o.completedAt).length;
  const inProduction = orders.filter((o) =>
    ["PRINTING", "PRODUCTION_READY", "QC"].includes(String(o.status || "").toUpperCase())
  ).length;
  const blocked = orders.filter((o) => o.blockedReason && String(o.blockedReason).trim()).length;

  const pendingGate = approvalGateService.getPendingApprovals();
  const hist = approvalGateService.getApprovalHistory(400);
  const daySlice = hist.filter((x) => {
    if (!x.resolvedAt) return false;
    try {
      const a = new Date(x.resolvedAt);
      return a.toDateString() === now.toDateString();
    } catch (_e) {
      return false;
    }
  });

  /** Friction excludes playbook rows */
  const friction = frictionLogService.tailRecent(12).filter((x) => x.area !== frictionLogService.PLAYBOOK_AREA);

  const square = await squareLiveReadService.refreshSquareOperationalSnapshot();

  /** cash outstanding heuristic from snapshot unpaid list */
  const data = square && square.data ? square.data : {};
  const unpaidCount = Array.isArray(data.unpaidInvoices) ? data.unpaidInvoices.length : 0;

  const gatePendingPatrick = pendingGate.filter((x) => x.requiresPatrick);

  /** @type {{ ordersCompleted: number, ordersInProduction: number, ordersBlocked: number, approvalsResolvedToday: number, approvalsPending: number, draftsPending: number, cashOutstandingSignals: object, frictionLogged: number, aiSummary: string, tomorrowPriorities: string[], flaggedForPatrick: object[] }}
   */
  const summary = {
    generatedAt: now.toISOString(),
    ordersCompleted: completed,
    ordersInProduction: inProduction,
    ordersBlocked: blocked,
    approvalsResolvedToday: daySlice.length,
    approvalsPending: pendingGate.length,
    draftsPending: draftsPendingCount(),
    cashOutstandingSignals: {
      squareStatus: square.status || "unknown",
      unpaidInvoiceSignals: unpaidCount,
      connectorMessage: square.message || "",
    },
    frictionLogged: friction.length,
    aiSummary:
      `Snapshot: ${completed} completed-ish rows in sample, ${inProduction} in active production codes, ${blocked} with holds. Pending gate approvals: ${pendingGate.length}. Drafts awaiting review (disk): ${draftsPendingCount()}. Square read: ${square.status}.`,
    tomorrowPriorities: [
      `Patrick priority: clear ${gatePendingPatrick.length} Patrick-gated approvals before customer sends or POs.`,
      "Jeremy priority: execute only after approvals — prep internal drafts when blocked.",
      "Cash: reconcile unpaid invoice signals against deposit rules before releasing garments.",
    ],
    flaggedForPatrick: gatePendingPatrick.slice(0, 35).map((a) => ({
      id: a.id,
      actionType: a.actionType,
      moneyImpact: a.moneyImpact,
      description: String(a.description || "").slice(0, 200),
      createdAt: a.createdAt,
    })),
    connectorNote:
      square.status === "cached"
        ? "Square served from cache — cash numbers may lag; drafts still generate from DB reads."
        : "Square snapshot refreshed for visibility only.",
  };

  return summary;
}

function recordShiftHandoff(body) {
  const fromActor = body && body.from ? String(body.from).slice(0, 120) : "operator";
  const toActor = body && body.to ? String(body.to).slice(0, 120) : "incoming_shift";
  const notes = body && body.notes ? String(body.notes).slice(0, 4000) : "";
  return appendHandoff({
    id: `sh-${Date.now()}`,
    from: fromActor,
    to: toActor,
    notes,
    linkedSummaryGeneratedAt: body && body.linkedSummaryGeneratedAt ? String(body.linkedSummaryGeneratedAt) : null,
    createdAt: new Date().toISOString(),
  });
}

module.exports = {
  computeShiftSummary,
  recordShiftHandoff,
  readHandoffs,
};
