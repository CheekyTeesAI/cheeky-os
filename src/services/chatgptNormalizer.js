"use strict";

function normalizePayments(payload) {
  const leads = Array.isArray(payload && payload.leadsNeedingDeposit)
    ? payload.leadsNeedingDeposit
    : [];
  return {
    success: Boolean(payload && payload.success !== false),
    count: leads.length,
    items: leads.map((l) => ({
      id: l.id,
      name: l.name || "Unknown",
      email: l.email || null,
      paymentStatus: l.paymentStatus || "UNPAID",
      depositRequired: Boolean(l.depositRequired),
      depositPaid: Boolean(l.depositPaid),
      depositAmount: l.depositAmount || null,
      createdAt: l.createdAt || null,
    })),
    timestamp: new Date().toISOString(),
  };
}

function normalizePipeline(payload) {
  const leads = Array.isArray(payload && payload.leads) ? payload.leads : [];
  const tasks = Array.isArray(payload && payload.tasks) ? payload.tasks : [];
  return {
    success: Boolean(payload && payload.success !== false),
    counts: {
      leads: leads.length,
      tasks: tasks.length,
    },
    leads: leads.map((l) => ({
      id: l.id,
      name: l.name || null,
      status: l.status || null,
      score: l.score || null,
      paymentStatus: l.paymentStatus || null,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      releaseStatus: t.releaseStatus || null,
      orderReady: Boolean(t.orderReady),
      blanksOrdered: Boolean(t.blanksOrdered),
    })),
    timestamp: new Date().toISOString(),
  };
}

function normalizeReleaseQueue(payload) {
  const tasks = Array.isArray(payload && payload.tasks) ? payload.tasks : [];
  return {
    success: Boolean(payload && payload.success !== false),
    count: tasks.length,
    blockedCount: tasks.filter((t) => String(t.releaseStatus || "") !== "READY").length,
    readyCount: tasks.filter((t) => String(t.releaseStatus || "") === "READY").length,
    items: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      releaseStatus: t.releaseStatus,
      orderReady: Boolean(t.orderReady),
      blanksOrdered: Boolean(t.blanksOrdered),
      productionHold: Boolean(t.productionHold),
      eligibleForVendorDraft: Boolean(t.eligibleForVendorDraft),
    })),
    timestamp: new Date().toISOString(),
  };
}

function normalizeVendorDrafts(payload) {
  const drafts = Array.isArray(payload && payload.drafts) ? payload.drafts : [];
  return {
    success: Boolean(payload && payload.success !== false),
    count: drafts.length,
    persistence: drafts.length ? "database" : "safe_fallback_possible",
    items: drafts.map((d) => ({
      id: d.id || null,
      taskId: d.taskId || null,
      leadId: d.leadId || null,
      vendorName: d.vendorName || null,
      customerName: d.customerName || null,
      status: d.status || "DRAFT",
      createdAt: d.createdAt || null,
    })),
    note:
      drafts.length === 0
        ? "Vendor draft persistence may be unavailable or currently empty."
        : "Vendor drafts returned from persisted records.",
    timestamp: new Date().toISOString(),
  };
}

function normalizeOperatorSummary(parts) {
  return {
    success: true,
    readiness: parts.readiness || {},
    systemStatus: parts.systemStatus || {},
    payments: {
      count: Number(parts.paymentCount || 0),
    },
    pipeline: {
      leads: Number(parts.pipelineLeadCount || 0),
      tasks: Number(parts.pipelineTaskCount || 0),
    },
    releaseQueue: {
      total: Number(parts.releaseCount || 0),
      ready: Number(parts.releaseReadyCount || 0),
    },
    vendorDrafts: {
      count: Number(parts.vendorDraftCount || 0),
    },
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  normalizePayments,
  normalizePipeline,
  normalizeReleaseQueue,
  normalizeVendorDrafts,
  normalizeOperatorSummary,
};
