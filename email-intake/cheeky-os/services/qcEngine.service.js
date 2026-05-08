"use strict";

const path = require("path");
const store = require("./qc.store");
const reprintEngine = require("./reprintEngine.service");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function normalizeDefects(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const type = String(d.type || "OTHER").toUpperCase();
    const severity = String(d.severity || "MEDIUM").toUpperCase();
    if (!store.VALID_DEFECT_TYPES.has(type)) continue;
    if (!store.VALID_SEVERITY.has(severity)) continue;
    out.push({
      type,
      severity,
      location: d.location != null ? String(d.location).slice(0, 200) : "",
      notes: d.notes != null ? String(d.notes).slice(0, 2000) : "",
    });
  }
  return out;
}

/**
 * Start or resume QC cycle: ensures one PENDING row when allowed.
 * @param {string} orderId
 */
async function runQualityCheck(orderId) {
  const oid = String(orderId || "").trim();
  if (!oid) return { ok: false, error: "order_id_required" };

  const prisma = getPrisma();
  if (!prisma || !prisma.order) return { ok: false, error: "prisma_unavailable" };

  let order;
  try {
    order = await prisma.order.findFirst({
      where: { id: oid, deletedAt: null },
      include: {
        lineItems: { take: 20, select: { description: true, quantity: true } },
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!order) return { ok: false, error: "order_not_found" };

  const st = String(order.status || "").toUpperCase();
  if (!["PRINTING", "QC"].includes(st)) {
    return { ok: false, error: "order_not_in_printing_or_qc", status: st };
  }

  if (store.findOpenPendingForOrder(oid)) {
    return { ok: true, check: store.findOpenPendingForOrder(oid), started: false };
  }

  const latest = store.getLatestCheckForOrder(oid);
  const latestSt = latest ? String(latest.status || "").toUpperCase() : "";

  if (latestSt === "PASS" || latestSt === "OVERRIDE_PASS") {
    if (st === "QC") {
      return { ok: true, check: latest, started: false, note: "qc_already_passed_pending_completion" };
    }
  }

  const now = new Date().toISOString();
  const check = {
    id: store.newId("qc"),
    orderId: oid,
    orderNumber: order.orderNumber || null,
    customerName: order.customerName || "",
    checkedBy: "",
    status: "PENDING",
    defects: [],
    defectsJson: [],
    notes: "",
    override: false,
    overrideReason: null,
    createdAt: now,
    updatedAt: now,
  };
  store.appendCheck(check);
  console.log(`[qc] QC STARTED orderId=${oid} checkId=${check.id}`);
  return { ok: true, check, started: true };
}

/**
 * @param {string} orderId
 * @param {object} body
 */
async function submitQualityCheck(orderId, body) {
  const oid = String(orderId || "").trim();
  if (!oid) return { ok: false, error: "order_id_required" };

  const prisma = getPrisma();
  if (!prisma || !prisma.order) return { ok: false, error: "prisma_unavailable" };

  let order;
  try {
    order = await prisma.order.findFirst({
      where: { id: oid, deletedAt: null },
      include: {
        lineItems: { take: 20, select: { description: true, quantity: true } },
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!order) return { ok: false, error: "order_not_found" };

  const ost = String(order.status || "").toUpperCase();
  if (!["PRINTING", "QC"].includes(ost)) {
    return { ok: false, error: "order_not_in_printing_or_qc", status: ost };
  }

  const pending = store.findOpenPendingForOrder(oid);
  if (!pending) {
    return { ok: false, error: "no_open_qc_pending", hint: "Open GET /api/qc/:orderId first to start a QC cycle" };
  }

  const status = String(body.status || "").toUpperCase();
  if (!["PASS", "FAIL", "OVERRIDE_PASS"].includes(status)) {
    return { ok: false, error: "invalid_status", allowed: ["PASS", "FAIL", "OVERRIDE_PASS"] };
  }

  if (status === "OVERRIDE_PASS") {
    const onote = body.notes != null ? String(body.notes).trim() : "";
    if (!onote) {
      return { ok: false, error: "override_requires_notes" };
    }
  }

  const checkedBy = body.checkedBy != null ? String(body.checkedBy).slice(0, 120) : "operator";
  const defects = normalizeDefects(body.defects);
  const notes = body.notes != null ? String(body.notes).slice(0, 4000) : "";

  if (status === "FAIL" && !defects.length && !notes) {
    return { ok: false, error: "fail_requires_defects_or_notes" };
  }

  const now = new Date().toISOString();
  const updated = {
    ...pending,
    status,
    checkedBy,
    defects,
    defectsJson: defects,
    notes: notes || pending.notes,
    override: status === "OVERRIDE_PASS",
    overrideReason: status === "OVERRIDE_PASS" ? notes : null,
    updatedAt: now,
  };
  store.updateCheck(updated);

  if (status === "PASS") {
    console.log(`[qc] QC PASS orderId=${oid}`);
    try {
      await prisma.order.update({
        where: { id: oid },
        data: { qcComplete: true },
      });
    } catch (_e) {
      /* non-fatal */
    }
    store.resolveReprintPlansForOrder(oid, "qc_pass");
  } else if (status === "OVERRIDE_PASS") {
    console.log(`[qc] QC OVERRIDE orderId=${oid}`);
    try {
      await prisma.order.update({
        where: { id: oid },
        data: { qcComplete: true, manualOverride: true, manualOverrideReason: `qc_override: ${notes}`.slice(0, 500) },
      });
    } catch (_e) {
      /* non-fatal */
    }
    store.resolveReprintPlansForOrder(oid, "qc_override_pass");
  } else if (status === "FAIL") {
    console.log(`[qc] QC FAIL orderId=${oid}`);
    try {
      await prisma.order.update({ where: { id: oid }, data: { qcComplete: false } });
    } catch (_e) {
      /* non-fatal */
    }
    await reprintEngine.evaluateReprint(oid, updated, order);
  }

  return { ok: true, check: store.getLatestCheckForOrder(oid), reprintPlan: store.findOpenReprintPlan(oid) };
}

async function getQcDetail(orderId) {
  const oid = String(orderId || "").trim();
  const prisma = getPrisma();
  if (!prisma || !prisma.order) return { ok: false, error: "prisma_unavailable" };

  let order;
  try {
    order = await prisma.order.findFirst({
      where: { id: oid, deletedAt: null },
      include: {
        lineItems: { take: 20, select: { description: true, quantity: true, productionType: true } },
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!order) return { ok: false, error: "order_not_found" };

  const checks = store.listChecks().filter((c) => c.orderId === oid);
  const latest = store.getLatestCheckForOrder(oid);
  const reprint = store.findOpenReprintPlan(oid);
  return {
    ok: true,
    order: {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status,
      depositPaidAt: order.depositPaidAt,
      qcComplete: order.qcComplete,
    },
    checks: checks.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    latest,
    openPending: store.findOpenPendingForOrder(oid),
    reprintPlan: reprint,
  };
}

/**
 * @param {string} orderId
 * @param {string} orderStatus
 */
function getQcBoardExtras(orderId, orderStatus) {
  const oid = String(orderId || "").trim();
  const stOrd = String(orderStatus || "").toUpperCase();
  const latest = store.getLatestCheckForOrder(oid);
  const openP = store.findOpenPendingForOrder(oid);
  const rp = store.findOpenReprintPlan(oid);
  const qcSt = openP ? "PENDING" : latest ? String(latest.status || "").toUpperCase() : "NONE";

  const warnings = [];
  if (["PRINTING", "QC"].includes(stOrd)) {
    if (qcSt === "NONE") warnings.push("Awaiting QC");
    if (qcSt === "PENDING") warnings.push("Awaiting QC");
    if (qcSt === "FAIL") warnings.push("QC Failed");
    if (rp && rp.needsReprint) warnings.push("Reprint required");
    if (rp && rp.productionBlocked) warnings.push("Production blocked — inventory / purchasing");
  }

  return {
    qcStatus: qcSt,
    qcCheckId: openP ? openP.id : latest ? latest.id : null,
    qcPending: qcSt === "PENDING",
    qcFailed: qcSt === "FAIL",
    qcPassed: qcSt === "PASS" || qcSt === "OVERRIDE_PASS",
    needsReprint: !!(rp && rp.needsReprint),
    productionBlocked: !!(rp && rp.productionBlocked),
    reprintPlanId: rp ? rp.id : null,
    qcWarnings: warnings,
    defectCount: latest && latest.defects ? latest.defects.length : 0,
  };
}

function ownerQcSnapshot() {
  const checks = store.listChecks();
  let pending = 0;
  for (const c of checks) {
    if (String(c.status || "").toUpperCase() === "PENDING") pending += 1;
  }
  const byOrder = new Map();
  for (const c of checks) {
    const cur = byOrder.get(c.orderId);
    if (!cur || String(c.createdAt) > String(cur.createdAt)) byOrder.set(c.orderId, c);
  }
  let failed = 0;
  for (const c of byOrder.values()) {
    if (String(c.status || "").toUpperCase() === "FAIL") failed += 1;
  }
  let reprints = 0;
  for (const p of store.listReprintPlans()) {
    if (String(p.status || "").toUpperCase() === "OPEN" && p.needsReprint) reprints += 1;
  }
  return { pending, failed, reprints };
}

module.exports = {
  runQualityCheck,
  submitQualityCheck,
  getQcDetail,
  getQcBoardExtras,
  ownerQcSnapshot,
  normalizeDefects,
};
