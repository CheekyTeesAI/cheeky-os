"use strict";

/**
 * Garment-order drafts — Carolina Made default vendor; consolidation hints only.
 */

const fs = require("fs");
const path = require("path");

const wf = require("../workflow/orderWorkflowRules");
const taskQueue = require("../agent/taskQueue");
const approvalGateService = require("../approvals/approvalGateService");
const helpers = require("./draftOrderHelpers");

const SUBDIR = "garment-order";

const DEFAULT_VENDOR = "Carolina Made";

const FUTURE_VENDORS = ["S&S", "SanMar", "alphabroder", "ShirtSpace", "Delta", "Brisco"];

function draftsRoot() {
  taskQueue.ensureDirAndFiles();
  const root = path.join(taskQueue.DATA_DIR, "drafts", SUBDIR);
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  return root;
}

function styleFingerprint(o) {
  const g = String(o.garmentType || "unknown_style").trim().toLowerCase();
  const notes = String(o.notes || "").toLowerCase();
  const colorMatch =
    notes.match(/\bcolor\s*[:#]?\s*([a-z0-9\- ]{2,32})/i) || notes.match(/\b([a-z]+)\s+t-?shirt\b/i);
  const color = colorMatch ? String(colorMatch[1]).trim() : "unspecified_color";
  return `${g}|${color}`;
}

/** @param {object} o */
function buildNeedLine(o) {
  return {
    garmentType: o.garmentType != null ? String(o.garmentType) : "",
    quantity: typeof o.quantity === "number" ? o.quantity : null,
    fingerprint: styleFingerprint(o),
  };
}

async function consolidateGarmentNeeds() {
  const rows = await helpers.loadOrdersForDrafts(400);
  /** @type {Record<string, object[]>} */
  const map = {};
  rows.forEach((o) => {
    if (!wf.depositPaid(o)) return;
    if (o.garmentOrderNeeded === false) return;
    if (o.garmentsOrdered) return;
    const fp = styleFingerprint(o);
    if (!map[fp]) map[fp] = [];
    map[fp].push({
      orderId: String(o.id),
      customer: String(o.customerName || ""),
      orderNumber: o.orderNumber != null ? String(o.orderNumber) : "",
      qty: typeof o.quantity === "number" ? o.quantity : 0,
      need: buildNeedLine(o),
    });
  });

  /** @type {object[]} */
  const opportunities = [];
  Object.keys(map).forEach((k) => {
    const list = map[k];
    if (!list || list.length < 2) return;
    const totalQty = list.reduce((s, x) => s + (typeof x.qty === "number" ? x.qty : 0), 0);
    const estSavingsUsd = Math.round(list.length * 12 + totalQty * 0.35);
    opportunities.push({
      fingerprint: k,
      orderCount: list.length,
      orders: list.map((x) => ({ orderId: x.orderId, customer: x.customer, qty: x.qty })),
      estimateSavingsUsd: estSavingsUsd,
      recommendation:
        "Combine onto one Carolina Made (or chosen vendor) PO after Patrick approves — still no auto-order here.",
    });
  });

  opportunities.sort((a, b) => b.orderCount - a.orderCount);

  return {
    generatedAt: new Date().toISOString(),
    consolidationOpportunities: opportunities,
    futureVendorsAllowedLabels: FUTURE_VENDORS.slice(),
  };
}

async function generateGarmentOrderDraft(orderId) {
  const o = await helpers.loadOrderById(orderId);
  if (!o) {
    return { ok: false, safeMessage: "Order not found for garment draft.", draft: null };
  }

  const consolidate = await consolidateGarmentNeeds();
  const match =
    consolidate.consolidationOpportunities &&
    consolidate.consolidationOpportunities.find((c) => (c.orders || []).some((row) => row.orderId === String(o.id)));

  const blockers = [];
  if (!wf.depositPaid(o)) blockers.push("Deposit missing — do not place garments until deposit clears.");
  if (!wf.artIsApproved(o)) blockers.push("Art not approved — garment buy may be wasted spend.");

  const draft = {
    draftKind: "garment_order",
    draftId: `go-${String(o.id)}`,
    orderId: String(o.id),
    customer: String(o.customerName || ""),
    defaultVendor: DEFAULT_VENDOR,
    alternativeVendorLabelsAllowed: FUTURE_VENDORS.slice(),
    apparelLine: buildNeedLine(o),
    depositStatus: wf.depositPaid(o) ? "deposit_received" : "deposit_missing",
    consolidationOpportunity: match || null,
    blockers,
    jeremyInstructions:
      "Prep counts and colors for Patrick; no PO without approval. Carolina Made is primary when you order.",
    approvalRequired: true,
    generatedAt: new Date().toISOString(),
    status: "pending_review",
  };

  const savedPath = saveDraftFile(draft.draftId, draft);

  const approval = approvalGateService.createApproval({
    actionType: "garment_order",
    orderId: String(o.id),
    customer: draft.customer,
    description: `Garment order draft for ${String(o.orderNumber || o.customerName || o.id)} — PO requires approval.`,
    draftPayload: { path: savedPath, preview: draft },
    impactLevel: "medium",
    requiresPatrick: true,
    moneyImpact: "inventory_spend_at_risk",
    requestedBy: "garment_order_draft_service",
    aiExplanation:
      "Medium impact: purchasing blanks affects cash. Draft only — visibility then Patrick approval before any vendor action.",
  });

  return {
    ok: true,
    draft,
    path: savedPath,
    approval,
  };
}

function saveDraftFile(draftId, draft) {
  const fn = `${String(draftId).replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
  const p = path.join(draftsRoot(), fn);
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(draft, null, 2), "utf8");
  fs.renameSync(tmp, p);
  return p;
}

function getGarmentOrderDraft(draftOrOrderId) {
  const id = String(draftOrOrderId || "").trim();
  const tryRead = (p) => {
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (_e) {
      return null;
    }
  };

  const canonical = path.join(draftsRoot(), `go-${id.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`);
  let hit = tryRead(canonical);
  if (hit) return hit;

  let files = [];
  try {
    files = fs.readdirSync(draftsRoot()).filter((f) => f.endsWith(".json"));
  } catch (_e) {
    return null;
  }
  for (let j = 0; j < files.length; j++) {
    const doc = tryRead(path.join(draftsRoot(), files[j]));
    if (doc && String(doc.orderId) === id) return doc;
  }
  return null;
}

function listPendingGarmentDrafts() {
  let files = [];
  try {
    files = fs.readdirSync(draftsRoot()).filter((f) => f.endsWith(".json"));
  } catch (_e) {
    return [];
  }
  /** @type {object[]} */
  const out = [];
  files.forEach((f) => {
    try {
      const raw = fs.readFileSync(path.join(draftsRoot(), f), "utf8");
      const j = JSON.parse(raw);
      if (!j.status || j.status === "pending_review")
        out.push({
          draftId: j.draftId,
          orderId: j.orderId,
          customer: j.customer,
          defaultVendor: j.defaultVendor,
          generatedAt: j.generatedAt,
          file: f,
        });
    } catch (_e) {}
  });
  return out;
}

module.exports = {
  generateGarmentOrderDraft,
  consolidateGarmentNeeds,
  getGarmentOrderDraft,
  listPendingGarmentDrafts,
  DEFAULT_VENDOR,
  FUTURE_VENDORS,
};
