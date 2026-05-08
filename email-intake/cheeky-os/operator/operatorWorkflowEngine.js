"use strict";

const crypto = require("crypto");

const safety = require("../agent/safetyGuard");
const graph = require("../connectors/graphEmailConnector");
const sqRead = require("../connectors/squareReadConnector");
const prod = require("../connectors/productionReadConnector");
const { computeOperationalPriorities } = require("../intelligence/priorityEngine");
const formatter = require("../operator/operatorResponseFormatter");
const traceEngine = require("../diagnostics/traceEngine");

function newCorr() {
  try {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `wf-${Date.now()}`;
  } catch (_e) {
    return `wf-${Date.now()}`;
  }
}

/**
 * WF1 — “What did X’s last email say?” Graph read-only.
 */
async function workflowLastEmailFromContact(contact, corr) {
  const started = Date.now();
  const correlationId = String(corr || "").trim() || newCorr();
  const traceId = traceEngine.newId("wf-email");
  try {
    safety.auditLog({
      eventType: "workflow_email_contact",
      taskId: null,
      correlationId,
      actor: "operator_workflow_engine",
      metadata: { workflow: "last_email_contact", readOnly: true, contactLen: String(contact || "").length },
    });
    const pack = await graph.getLastEmailFromContact(String(contact || "").trim());
    const summary =
      pack && pack.summary
        ? `From ${pack.summary.fromName || "?"} (${pack.summary.fromAddress || ""}) — Subject: ${pack.summary.subject}. Preview: ${(pack.summary.preview || "").slice(0, 400)}`
        : pack && pack.matched === false
          ? "No recent inbound message matched that contact in the Graph window."
          : "Mailbox read completed; no excerpt returned.";

    traceEngine.recordTrace({
      traceId,
      correlationId,
      requestPath: "workflow:last_email_contact",
      startedAt: new Date(started).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      success: !!(pack && pack.ok !== false),
      error: pack && pack.ok === false ? String(pack.error || "") : null,
    });

    try {
      const oce = require("../memory/operationalContinuityEngine");
      oce.recordInteractionTurn({
        kind: "workflow_email",
        contactStub: String(contact || "").slice(0, 32),
      });
    } catch (_oc) {}

    return {
      ok: !!(pack && pack.ok !== false),
      answer: summary,
      matched: !!(pack && pack.matched),
      sources: ["graph:getLastEmailFromContact"],
      confidence: pack && pack.matched ? 0.84 : 0.55,
      traceId,
      correlationId,
    };
  } catch (e) {
    traceEngine.recordTrace({
      traceId,
      correlationId,
      requestPath: "workflow:last_email_contact",
      durationMs: Date.now() - started,
      success: false,
      error: e.message || String(e),
    });
    return { ok: false, answer: "", error: e.message || String(e), correlationId };
  }
}

/** WF2 — unpaid / risky invoices (Square read-only). */
async function workflowRiskyInvoices(corr) {
  const started = Date.now();
  const correlationId = String(corr || "").trim() || newCorr();
  const traceId = traceEngine.newId("wf-inv");
  try {
    safety.auditLog({
      eventType: "workflow_square_unpaid",
      taskId: null,
      correlationId,
      actor: "operator_workflow_engine",
      metadata: { workflow: "risky_invoices", readOnly: true },
    });
    const pack = await sqRead.findUnpaidInvoices();
    const items = (pack && pack.items) || [];
    let cents = 0;
    for (let i = 0; i < items.length; i++) cents += Number(items[i].computedDueCents || 0) || 0;

    const line = formatter.formatFinancialSummary({
      unpaidCount: items.length,
      outstandingCents: cents,
    });

    traceEngine.recordTrace({
      traceId,
      correlationId,
      requestPath: "workflow:risky_invoices",
      durationMs: Date.now() - started,
      success: !!(pack && pack.ok),
      error: pack && !pack.ok ? String(pack.error || "") : null,
    });

    return {
      ok: !!(pack && pack.ok),
      answer: `${line} Sources: Square invoice search (read-only).`,
      itemsSample: items.slice(0, 15),
      sources: ["square:findUnpaidInvoices"],
      confidence: 0.73,
      traceId,
      correlationId,
    };
  } catch (e) {
    traceEngine.recordTrace({
      traceId,
      correlationId,
      requestPath: "workflow:risky_invoices",
      durationMs: Date.now() - started,
      success: false,
      error: e.message || String(e),
    });
    return { ok: false, answer: "", error: e.message || String(e), correlationId };
  }
}

/** WF3 — late production jobs narrative. */
function workflowLateProductionSummary(corr) {
  const started = Date.now();
  const correlationId = String(corr || "").trim() || newCorr();
  const traceId = traceEngine.newId("wf-late");
  try {
    safety.auditLog({
      eventType: "workflow_production_late",
      taskId: null,
      correlationId,
      actor: "operator_workflow_engine",
      metadata: { workflow: "late_jobs", readOnly: true },
    });
    const q = prod.getProductionQueue();
    const latePack = prod.getLateJobs();
    const lateN = typeof latePack.count === "number" ? latePack.count : Array.isArray(latePack.preview) ? latePack.preview.length : 0;
    const prios = computeOperationalPriorities(6);
    const text = formatter.formatProductionSummary({
      queueSize: Number(q.cheekyJobs != null ? q.cheekyJobs : 0) || 0,
      lateJobsApprox: lateN,
      tasksRunning: 0,
      tasksFailed: 0,
    });

    traceEngine.recordTrace({
      traceId,
      correlationId,
      requestPath: "workflow:late_production_summary",
      durationMs: Date.now() - started,
      success: true,
    });

    return {
      ok: true,
      answer: `${text}. Focus: ${(prios[0] && prios[0].title) || "Prioritize cash + approvals via priority engine."}`,
      sources: ["production:getLateJobs", "production:getProductionQueue", "priorityEngine"],
      confidence: 0.67,
      traceId,
      correlationId,
    };
  } catch (e) {
    traceEngine.recordTrace({
      traceId,
      correlationId,
      requestPath: "workflow:late_production_summary",
      durationMs: Date.now() - started,
      success: false,
      error: e.message || String(e),
    });
    return { ok: false, error: e.message || String(e), correlationId };
  }
}

module.exports = {
  workflowLastEmailFromContact,
  workflowRiskyInvoices,
  workflowLateProductionSummary,
};
