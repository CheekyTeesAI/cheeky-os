/**
 * Ranked executive actions — cash first, then deadlines, flow, then opportunities.
 */
const { loadExecutiveContext } = require("./executiveContextService");

function scoreBase(type) {
  if (type === "CASH") return 100;
  if (type === "RISK") return 80;
  if (type === "FLOW") return 55;
  if (type === "OPPORTUNITY") return 35;
  if (type === "COMM") return 25;
  return 20;
}

/**
 * @param {object} [ctx]
 * @param {object} [cashflow]
 * @param {object} [risks]
 * @param {object} [opportunities]
 */
async function generateExecutiveActions(ctx, cashflow, risks, opportunities) {
  const c = ctx || (await loadExecutiveContext());
  const cf = cashflow || {};
  const rk = risks || {};
  const op = opportunities || {};

  const actions = [];

  for (const row of (cf.highPriorityCollections || []).slice(0, 8)) {
    const amt = row.amountDue != null ? `$${Math.round(row.amountDue)}` : "open balance";
    actions.push({
      title: `Collect ${amt} — ${row.customerName || "customer"} (invoice)`,
      type: "CASH",
      priorityScore: scoreBase("CASH") + Math.min(20, (row.amountDue || 0) / 200),
      impact: "HIGH",
      effort: "LOW",
      instructions: "Confirm in Square, send reminder or call — use communications preview first.",
      relatedId: row.squareInvoiceId || "",
      nextCommand: "Preview invoice reminders",
    });
  }

  for (const row of (cf.depositsNeeded || []).slice(0, 8)) {
    actions.push({
      title: `Deposit required — ${row.customer} (${row.jobId})`,
      type: "CASH",
      priorityScore: scoreBase("CASH") + 5,
      impact: "HIGH",
      effort: "LOW",
      instructions: "Send deposit reminder or payment link after verifying amount in Square.",
      relatedId: row.jobId,
      nextCommand: `Send deposit reminder for job ${row.jobId}`,
    });
  }

  for (const row of (rk.criticalRisks || []).slice(0, 8)) {
    actions.push({
      title: `Past due — ${row.customer} (${row.jobId})`,
      type: "RISK",
      priorityScore: scoreBase("RISK") + 15,
      impact: "HIGH",
      effort: "MEDIUM",
      instructions: "Confirm promise date, unblock art/payment, or reset customer expectation.",
      relatedId: row.jobId,
      nextCommand: `Show communication history for job ${row.jobId}`,
    });
  }

  for (const row of (rk.upcomingRisks || []).slice(0, 8)) {
    actions.push({
      title: `${row.type || "Risk"} — ${row.customer} (${row.jobId})`,
      type: "RISK",
      priorityScore: scoreBase("RISK") + 5,
      impact: "MEDIUM",
      effort: "MEDIUM",
      instructions: "Triage readiness vs due date; escalate if due within 24–48h.",
      relatedId: row.jobId,
      nextCommand: "What is blocked?",
    });
  }

  for (const row of (rk.vendorRisks || []).slice(0, 5)) {
    if (row.poNumber) {
      actions.push({
        title: `Vendor issue — PO ${row.poNumber}`,
        type: "FLOW",
        priorityScore: scoreBase("FLOW") + 5,
        impact: "MEDIUM",
        effort: "MEDIUM",
        instructions: "Check vendor outbound status and re-send or call supplier.",
        relatedId: String(row.poNumber),
        nextCommand: "Preview purchase orders",
      });
    }
  }

  for (const row of (op.highValueOpportunities || []).slice(0, 6)) {
    if (row.intakeId) {
      actions.push({
        title: `Convert intake ${row.intakeId} — ${row.type || "opportunity"}`,
        type: "OPPORTUNITY",
        priorityScore: scoreBase("OPPORTUNITY") + 10,
        impact: "MEDIUM",
        effort: "LOW",
        instructions: "Move to quote or job while intent is fresh.",
        relatedId: row.intakeId,
        nextCommand: `Convert intake ${row.intakeId} to quote`,
      });
    }
    if (row.jobId && row.type === "COLLECT_ON_COMPLETE") {
      actions.push({
        title: `Collect balance on completed work — ${row.customer}`,
        type: "CASH",
        priorityScore: scoreBase("CASH") + 8,
        impact: "HIGH",
        effort: "LOW",
        instructions: "Verify pickup/delivery state then invoice or collect per Square.",
        relatedId: row.jobId,
        nextCommand: "Where is money stuck?",
      });
    }
  }

  for (const row of (op.quickWins || []).slice(0, 6)) {
    if (row.type === "READY_TO_PRODUCE" || row.type === "INVOICE_READY_TO_CLOSE") {
      actions.push({
        title: `Push production / close invoice — ${row.jobId}`,
        type: "FLOW",
        priorityScore: scoreBase("FLOW") + 8,
        impact: "MEDIUM",
        effort: "LOW",
        instructions: "Schedule print or finalize invoice when work is verified complete.",
        relatedId: row.jobId,
        nextCommand: "What should we print first?",
      });
    }
  }

  const commCount = (c.communications && c.communications.recommendations && c.communications.recommendations.length) || 0;
  if (commCount > 0) {
    actions.push({
      title: `${commCount} outbound message(s) recommended (preview-first)`,
      type: "COMM",
      priorityScore: scoreBase("COMM"),
      impact: "LOW",
      effort: "LOW",
      instructions: "Review communications recommendations before any send.",
      relatedId: "",
      nextCommand: "What communications are ready?",
    });
  }

  actions.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

  const seen = new Set();
  const deduped = [];
  for (const a of actions) {
    const key = `${a.type}|${a.title}|${a.relatedId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(a);
  }

  return deduped.slice(0, 25);
}

module.exports = {
  generateExecutiveActions,
};
