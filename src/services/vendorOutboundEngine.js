/**
 * Vendor outbound orchestration — preview, approval-gated send, logging.
 */
const fs = require("fs");

const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { buildPurchasePlan } = require("./purchasingPlanner");
const {
  getAllPurchaseOrders,
  getPurchaseOrder,
  updatePurchaseOrder,
  syncPurchaseOrdersFromPlan,
} = require("./poRegistryService");
const { getVendorBySupplierName } = require("./vendorProfileService");
const { determineShipTo } = require("./shipToEngine");
const { prepareAttachmentBundle } = require("./vendorDocumentService");
const { composeVendorEmail } = require("./vendorEmailComposer");
const { sendVendorEmail } = require("./vendorSendService");
const { routeJob } = require("./routingEngine");
const { logEvent } = require("./foundationEventLog");
const {
  requireApproval,
  listPendingApprovals,
  approveAction,
  getApproval,
} = require("./approvalEngine");

async function logOutbound(message) {
  try {
    await logEvent(null, "VENDOR_OUTBOUND", String(message || ""));
  } catch (_e) {
    console.log("[vendorOutbound]", message);
  }
}

function jobIndex(jobs) {
  const m = new Map();
  for (const j of Array.isArray(jobs) ? jobs : []) {
    if (j && j.jobId) m.set(j.jobId, j);
  }
  return m;
}

function anyLinkedJobBullseye(linkedJobIds, jobs) {
  const jm = jobIndex(jobs);
  for (const id of Array.isArray(linkedJobIds) ? linkedJobIds : []) {
    const j = jm.get(id);
    if (!j) continue;
    const r = routeJob(j);
    if (String(r.location || "").toUpperCase() === "BULLSEYE") return true;
  }
  return false;
}

function validatePo(po, vendor, opts) {
  const requireEmail = Boolean(opts && opts.requireVendorEmail);
  const errors = [];
  if (!po || !po.poNumber) errors.push("missing_poNumber");
  if (!po || !String(po.supplier || "").trim()) errors.push("missing_supplier");
  if (!po || !Array.isArray(po.items) || po.items.length === 0) errors.push("missing_line_items");
  const email = vendor && String(vendor.email || "").trim();
  if (requireEmail && !email) errors.push("missing_vendor_email_env");
  return { ok: errors.length === 0, errors };
}

function ensureAttachmentsReadable(bundle) {
  const errors = [];
  for (const a of bundle.attachments || []) {
    try {
      if (!a || !a.path) {
        errors.push("attachment_path_missing");
        continue;
      }
      fs.accessSync(a.path, fs.constants.R_OK);
    } catch (e) {
      errors.push(`attachment_unreadable:${a && a.filename}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

async function resolvePurchaseOrder(poNumber, jobs) {
  const p = String(poNumber || "").trim();
  let po = getPurchaseOrder(p);
  if (po) return { po, jobs };
  const plan = await buildPurchasePlan(jobs);
  syncPurchaseOrdersFromPlan(plan.purchaseOrders || []);
  po = getPurchaseOrder(p);
  if (po) return { po, jobs: await getOperatingSystemJobs() };
  const hit = (plan.purchaseOrders || []).find((x) => x && x.poNumber === p);
  if (hit) {
    syncPurchaseOrdersFromPlan([hit]);
    return { po: getPurchaseOrder(p) || hit, jobs: await getOperatingSystemJobs() };
  }
  return { po: null, jobs: await getOperatingSystemJobs() };
}

/**
 * Full compose pipeline for one PO.
 */
async function buildComposedOutbound(po, jobs, shipOpts) {
  const vendor = getVendorBySupplierName(po.supplier);
  const v = vendor || {};
  const anyBull = anyLinkedJobBullseye(po.linkedJobs, jobs);
  await logOutbound(
    `direct-ship decision: po=${po.poNumber} anyLinkedBullseye=${anyBull} supplier=${po.supplier}`,
  );
  const shipTo = determineShipTo(po, v, {
    anyLinkedJobBullseye: anyBull,
    directShipToBullseye: Boolean(shipOpts && shipOpts.directShipToBullseye),
  });
  const bundle = prepareAttachmentBundle(po, v, shipTo);
  const readOk = ensureAttachmentsReadable(bundle);
  if (!readOk.ok) {
    return { error: "attachment_failed", detail: readOk.errors, vendor: v, shipTo, bundle: null, composed: null };
  }
  const composed = composeVendorEmail({
    vendor: v,
    po,
    shipTo,
    attachments: bundle.attachments,
  });
  return { error: null, vendor: v, shipTo, bundle, composed };
}

async function previewPurchaseOrdersForSend() {
  const jobs = await getOperatingSystemJobs();
  const plan = await buildPurchasePlan(jobs);
  syncPurchaseOrdersFromPlan(plan.purchaseOrders || []);
  const merged = getAllPurchaseOrders();
  const list = [];
  for (const po of merged) {
    const vendor = getVendorBySupplierName(po.supplier);
    const val = validatePo(po, vendor, { requireVendorEmail: true });
    const anyBull = anyLinkedJobBullseye(po.linkedJobs, jobs);
    const shipTo = determineShipTo(po, vendor, { anyLinkedJobBullseye: anyBull, directShipToBullseye: false });
    list.push({
      poNumber: po.poNumber,
      supplier: po.supplier,
      sendStatus: po.sendStatus || "DRAFT",
      ready: val.ok,
      validationErrors: val.errors,
      shipToSummary: `${shipTo.shipToName} — ${shipTo.reason}`,
      linkedJobs: po.linkedJobs || [],
      directShipCandidate: anyBull,
    });
  }
  await logOutbound(`PO preview list built: count=${list.length}`);
  return {
    success: true,
    mock: Boolean(plan.mock),
    purchaseOrders: list,
  };
}

async function previewOnePo(poNumber, mode, shipOpts) {
  const jobs = await getOperatingSystemJobs();
  const { po } = await resolvePurchaseOrder(poNumber, jobs);
  if (!po) {
    return { success: false, error: "po_not_found", message: `No PO ${poNumber}` };
  }
  const vendor = getVendorBySupplierName(po.supplier);
  const val = validatePo(po, vendor, { requireVendorEmail: false });
  if (!val.ok) {
    return {
      success: false,
      error: "po_incomplete",
      validationErrors: val.errors,
      poNumber: po.poNumber,
    };
  }
  const built = await buildComposedOutbound(po, jobs, shipOpts || {});
  if (built.error) {
    return {
      success: false,
      error: built.error,
      detail: built.detail,
      poNumber: po.poNumber,
    };
  }
  const sendResult = await sendVendorEmail({
    vendor: built.vendor,
    composedEmail: built.composed,
    mode: "PREVIEW",
  });
  const emailReady = Boolean(String(built.vendor.email || "").trim());
  updatePurchaseOrder(po.poNumber, {
    shipTo: built.shipTo,
    sendStatus: po.sendStatus === "SENT" ? "SENT" : emailReady ? "READY" : "DRAFT",
  });
  await logOutbound(`PO preview built: ${po.poNumber} mode=${mode}`);
  let approval = null;
  if (String(mode || "PREVIEW").toUpperCase() === "PREVIEW") {
    approval = requireApproval("VENDOR_PO_SEND", {
      poNumber: po.poNumber,
      supplier: po.supplier,
      previewSubject: built.composed.subject,
    });
    await logOutbound(`approval created: ${approval.id} for ${po.poNumber}`);
  }
  return {
    success: true,
    mock: false,
    po,
    vendor: { vendorKey: built.vendor.vendorKey, name: built.vendor.name, email: built.vendor.email || null },
    shipTo: built.shipTo,
    sendResult,
    composed: {
      subject: built.composed.subject,
      body: built.composed.body,
      attachments: (built.bundle.attachments || []).map((a) => ({
        filename: a.filename,
        type: a.type,
        path: a.path,
      })),
    },
    approvalId: approval ? approval.id : null,
  };
}

async function sendPurchaseOrder(poNumber, mode, approvalId) {
  const m = String(mode || "PREVIEW").toUpperCase();
  if (m === "PREVIEW") {
    return previewOnePo(poNumber, "PREVIEW", {});
  }
  if (m !== "SEND") {
    return { success: false, error: "invalid_mode" };
  }
  let aid = String(approvalId || "").trim();
  if (!aid) {
    const p = String(poNumber || "").trim();
    const hit = listPendingApprovals().find(
      (a) =>
        a.type === "VENDOR_PO_SEND" && a.payload && String(a.payload.poNumber) === p,
    );
    if (hit) aid = hit.id;
  }
  if (!aid) {
    return {
      success: false,
      error: "approval_required",
      message:
        "Run mode PREVIEW first (creates a pending approval), then SEND again, POST /vendor/outbound/approve, or pass approvalId.",
    };
  }
  const row = getApproval(aid);
  if (!row || row.status !== "PENDING" || row.type !== "VENDOR_PO_SEND") {
    return { success: false, error: "invalid_or_expired_approval", approvalId: aid };
  }
  const payloadPo = row.payload && row.payload.poNumber;
  if (payloadPo && String(payloadPo) !== String(poNumber).trim()) {
    return { success: false, error: "approval_po_mismatch", expected: payloadPo, got: poNumber };
  }
  const jobs = await getOperatingSystemJobs();
  const { po } = await resolvePurchaseOrder(poNumber, jobs);
  if (!po) {
    return { success: false, error: "po_not_found" };
  }
  const vendor = getVendorBySupplierName(po.supplier);
  const val = validatePo(po, vendor, { requireVendorEmail: true });
  if (!val.ok) {
    return { success: false, error: "po_incomplete", validationErrors: val.errors };
  }
  const built = await buildComposedOutbound(po, jobs, {});
  if (built.error) {
    return { success: false, error: built.error, detail: built.detail };
  }
  await logOutbound(`approval granted (send attempt): ${aid} for ${po.poNumber}`);
  const out = await sendVendorEmail({
    vendor: built.vendor,
    composedEmail: built.composed,
    mode: "SEND",
  });
  if (out.sent && out.messageId) {
    approveAction(aid);
    updatePurchaseOrder(po.poNumber, {
      sendStatus: "SENT",
      messageId: out.messageId,
      shipTo: built.shipTo,
      lastError: null,
    });
    await logOutbound(`vendor email sent: ${po.poNumber} messageId=${out.messageId}`);
  } else {
    updatePurchaseOrder(po.poNumber, {
      sendStatus: "FAILED",
      lastError: out.error || "send_failed",
      shipTo: built.shipTo,
    });
    await logOutbound(`vendor email failed: ${po.poNumber} ${out.error || "unknown"}`);
  }
  return {
    success: Boolean(out.success),
    sent: Boolean(out.sent),
    mock: Boolean(out.mock),
    provider: out.provider,
    error: out.error,
    messageId: out.messageId,
    poNumber: po.poNumber,
    approvalId: aid,
  };
}

async function previewBullseyeDirectShip(jobIdOrPo) {
  const raw = String(jobIdOrPo || "").trim();
  if (!raw) {
    return { success: false, error: "jobId_or_poNumber_required" };
  }
  let po = null;
  if (raw.startsWith("PO-") || raw.toUpperCase().includes("PO-")) {
    const r = await resolvePurchaseOrder(raw, await getOperatingSystemJobs());
    po = r.po;
  }
  if (!po) {
    const all = getAllPurchaseOrders();
    po = all.find((p) => (p.linkedJobs || []).some((j) => j === raw)) || null;
  }
  if (!po) {
    return { success: false, error: "po_or_job_not_found", hint: raw };
  }
  return previewOnePo(po.poNumber, "PREVIEW", { directShipToBullseye: true });
}

async function approveAndSend(approvalId) {
  const id = String(approvalId || "").trim();
  const row = getApproval(id);
  if (!row || row.type !== "VENDOR_PO_SEND") {
    return { success: false, error: "approval_not_found" };
  }
  const poNumber = row.payload && row.payload.poNumber;
  if (!poNumber) {
    return { success: false, error: "approval_payload_invalid" };
  }
  return sendPurchaseOrder(poNumber, "SEND", id);
}

function getOutboundDashboardSlice() {
  const orders = getAllPurchaseOrders();
  const pending = listPendingApprovals().filter((a) => a.type === "VENDOR_PO_SEND");
  const purchaseOrdersReady = orders.filter((o) => String(o.sendStatus || "").toUpperCase() === "READY");
  const vendorOutboundStatus = orders.map((o) => ({
    poNumber: o.poNumber,
    supplier: o.supplier,
    sendStatus: o.sendStatus || "DRAFT",
    lastError: o.lastError || null,
    messageId: o.messageId || null,
    updatedAt: o.updatedAt || null,
  }));
  const directShipOrders = orders.filter((o) => {
    const st = o.shipTo;
    return st && String(st.shipToName || "").toLowerCase().includes("bullseye");
  });
  return {
    purchaseOrdersReady,
    pendingApprovals: pending,
    vendorOutboundStatus,
    directShipOrders,
  };
}

module.exports = {
  previewPurchaseOrdersForSend,
  sendPurchaseOrder,
  previewBullseyeDirectShip,
  approveAndSend,
  getOutboundDashboardSlice,
  buildComposedOutbound,
  anyLinkedJobBullseye,
};
