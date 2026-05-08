"use strict";

/**
 * Work-order drafts — recommend-only; never moves order status.
 */

const fs = require("fs");
const path = require("path");

const wf = require("../workflow/orderWorkflowRules");
const taskQueue = require("../agent/taskQueue");
const approvalGateService = require("../approvals/approvalGateService");
const helpers = require("./draftOrderHelpers");

const SUBDIR = "work-order";

function draftsRoot() {
  taskQueue.ensureDirAndFiles();
  const root = path.join(taskQueue.DATA_DIR, "drafts", SUBDIR);
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function fileForOrder(orderId) {
  return path.join(draftsRoot(), `${String(orderId).replace(/[^a-zA-Z0-9-_]/g, "_")}.json`);
}

/** @param {object} o */
function financialsFromOrder(o) {
  const total =
    (typeof o.totalAmount === "number" && o.totalAmount) ||
    (typeof o.amountTotal === "number" && o.amountTotal) ||
    (typeof o.total === "number" && o.total) ||
    0;
  const paid = typeof o.amountPaid === "number" ? o.amountPaid : 0;
  const depReq = typeof o.depositRequired === "number" ? o.depositRequired : null;
  return {
    quotedTotal: total,
    balanceDueHint: Math.max(0, total - paid),
    amountPaid: paid,
    depositRequired: depReq,
    depositPaidFlag: !!wf.depositPaid(o),
    squareInvoicePublished: !!o.squareInvoicePublished,
  };
}

function blockersFromOrder(o) {
  const b = [];
  if (!wf.depositPaid(o)) b.push("Deposit not recorded — production stays paused until Square shows paid.");
  if (!wf.artIsApproved(o)) b.push("Art not fully approved — proofs or files still pending.");
  return b;
}

function jeremyLines(o) {
  const pm = String(o.printMethod || o.productionTypeFinal || "assign_method").toUpperCase();
  const parts = [
    `Confirm print method: ${pm}.`,
    wf.depositPaid(o)
      ? "Deposit recorded — keep garment receipts aligned before hitting presses."
      : "Do not consume blanks until deposit clears — build internal prep only.",
    wf.artIsApproved(o) ? "Art approved — safe to stage screens or files per work order." : "Hold production until art approval is explicit.",
  ];
  return parts.join(" ");
}

/**
 * @param {string} orderId
 */
async function generateWorkOrderDraft(orderId) {
  const o = await helpers.loadOrderById(orderId);
  if (!o) {
    return {
      ok: false,
      safeMessage: "Order not found in read-only database snapshot — check order id.",
      draft: null,
    };
  }

  const blockers = blockersFromOrder(o);
  const draft = {
    draftKind: "work_order",
    orderId: String(o.id),
    customer: String(o.customerName || ""),
    contact: {
      email: String(o.email || ""),
      phone: o.phone != null ? String(o.phone) : "",
    },
    orderName: String(o.orderNumber || o.customerName || o.id).slice(0, 120),
    productionMethod: String(o.printMethod || o.productionTypeFinal || "tbd").toUpperCase(),
    garments: {
      garmentType: o.garmentType != null ? String(o.garmentType) : "",
      quantity: typeof o.quantity === "number" ? o.quantity : null,
      vendorHint: o.garmentVendor != null ? String(o.garmentVendor) : "Carolina Made (default)",
    },
    artStatus: {
      artApprovalStatus: o.artApprovalStatus != null ? String(o.artApprovalStatus) : "",
      proofStatus: o.proofStatus != null ? String(o.proofStatus) : "",
      artFileUrl: o.artFileUrl != null ? String(o.artFileUrl) : "",
    },
    printLocation: {
      mockupUrl: o.mockupUrl != null ? String(o.mockupUrl) : "",
      notes: String(o.notes || "").slice(0, 1500),
    },
    financials: financialsFromOrder(o),
    timeline: {
      quoteExpiresAt: o.quoteExpiresAt ? new Date(o.quoteExpiresAt).toISOString() : null,
      dueHint: o.quoteExpiresAt ? `Quote / due attention: ${new Date(o.quoteExpiresAt).toISOString()}` : "No quote expiry on file.",
    },
    blockers,
    jeremyInstructions: jeremyLines(o),
    approvalRequired: true,
    generatedAt: new Date().toISOString(),
    status: "pending_review",
  };

  const saved = saveWorkOrderDraft(draft);

  const approval = approvalGateService.createApproval({
    actionType: "work_order_draft",
    orderId: String(o.id),
    customer: draft.customer,
    description: `Work order draft for ${draft.orderName} — review before any floor action.`,
    draftPayload: { path: saved.path, preview: draft },
    impactLevel: "medium",
    requiresPatrick: true,
    moneyImpact: wf.depositPaid(o) ? "production_spend_expected" : "blocked_until_deposit",
    requestedBy: "work_order_draft_service",
    aiExplanation:
      "Medium impact: commits shop time once executed. Visibility -> draft -> Patrick approve -> Jeremy executes physically.",
  });

  return {
    ok: true,
    draft,
    path: saved.path,
    approval,
    guarded: true,
    blockedResponse: null,
  };
}

function saveWorkOrderDraft(draft) {
  const p = fileForOrder(draft.orderId);
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(draft, null, 2), "utf8");
  fs.renameSync(tmp, p);
  return { path: p };
}

function getWorkOrderDraft(orderId) {
  const p = fileForOrder(orderId);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_e) {
    return null;
  }
}

function listPendingWorkOrderDrafts() {
  const root = draftsRoot();
  let files = [];
  try {
    files = fs.readdirSync(root).filter((f) => f.endsWith(".json"));
  } catch (_e) {
    return [];
  }
  /** @type {object[]} */
  const out = [];
  files.forEach((f) => {
    try {
      const raw = fs.readFileSync(path.join(root, f), "utf8");
      const j = JSON.parse(raw);
      if (!j.status || j.status === "pending_review") out.push({ file: f, summary: summarizeWo(j) });
    } catch (_e) {}
  });
  return out;
}

function summarizeWo(j) {
  return {
    orderId: j.orderId,
    customer: j.customer,
    orderName: j.orderName,
    status: j.status,
    generatedAt: j.generatedAt,
  };
}

module.exports = {
  generateWorkOrderDraft,
  saveWorkOrderDraft,
  getWorkOrderDraft,
  listPendingWorkOrderDrafts,
};
