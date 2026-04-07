/**
 * Bundle 45 — coordinated auto-execution from gap detector (guardrails + executor limits).
 */

const { canRun } = require("./autopilotGuardService");
const { getNextActionsPayload } = require("./gapDetectorService");
const { runFollowupExecutor } = require("./followupExecutorService");
const { runInvoiceExecutor } = require("./invoiceExecutorService");
const { runProductionExecutor } = require("./productionExecutorService");
const { recordLedgerEventSafe } = require("./actionLedgerService");

/** @type {{ at: string, success: boolean, summary: { followupsSent: number, invoicesCreated: number, productionMoves: number } }} */
let lastRunSnapshot = {
  at: "",
  success: false,
  summary: { followupsSent: 0, invoicesCreated: 0, productionMoves: 0 },
};

function getLastAutoExecutionSnapshot() {
  return {
    at: String(lastRunSnapshot.at || ""),
    success: !!lastRunSnapshot.success,
    summary: {
      followupsSent: Math.max(0, Math.floor(Number(lastRunSnapshot.summary.followupsSent) || 0)),
      invoicesCreated: Math.max(0, Math.floor(Number(lastRunSnapshot.summary.invoicesCreated) || 0)),
      productionMoves: Math.max(0, Math.floor(Number(lastRunSnapshot.summary.productionMoves) || 0)),
    },
  };
}

/**
 * @param {string} action
 * @returns {"followup" | "invoice" | "production" | null}
 */
function classifyAction(action) {
  const s = String(action || "").toLowerCase();
  if (/\bdeposit\b/.test(s)) return "followup";
  if (/\bfollow[- ]?ups?\b/.test(s) || /\bfollow up\b/.test(s)) return "followup";
  if (/\binvoice\b/.test(s)) return "invoice";
  if (/\bproduction\b/.test(s) || (/\badvance\b/.test(s) && /\bjob/.test(s))) return "production";
  return null;
}

function touchLastRun(success, summary) {
  lastRunSnapshot = {
    at: new Date().toISOString(),
    success: !!success,
    summary: {
      followupsSent: Math.max(0, Math.floor(Number(summary.followupsSent) || 0)),
      invoicesCreated: Math.max(0, Math.floor(Number(summary.invoicesCreated) || 0)),
      productionMoves: Math.max(0, Math.floor(Number(summary.productionMoves) || 0)),
    },
  };
}

/**
 * Hard caps align with executor internals (3 / 2 / 5); max 2 categories per run gap-driven.
 * @returns {Promise<{ success: boolean, executed: object[], skipped: object[], summary: object }>}
 */
async function runAutoExecutionCycle() {
  const executed = [];
  const skipped = [];
  const summary = { followupsSent: 0, invoicesCreated: 0, productionMoves: 0 };

  const gate = canRun("automation_execute");
  if (!gate.allowed) {
    try {
      recordLedgerEventSafe({
        type: "autopilot",
        action: "auto_execution_blocked",
        status: "blocked",
        reason: String(gate.reason || ""),
      });
    } catch (_) {}
    touchLastRun(false, summary);
    return {
      success: false,
      executed,
      skipped: [{ kind: "guard", reason: String(gate.reason || "blocked") }],
      summary,
    };
  }

  /** @type {{ topActions?: object[] }} */
  let payload = { topActions: [] };
  try {
    payload = await getNextActionsPayload();
  } catch (err) {
    skipped.push({
      kind: "gap_detector",
      reason: String(err && err.message ? err.message : err),
    });
  }

  const topActions = Array.isArray(payload.topActions) ? payload.topActions : [];
  /** @type {("followup" | "invoice" | "production")[]} */
  const categories = [];

  for (const ta of topActions) {
    if (!ta || typeof ta !== "object") continue;
    const cat = classifyAction(/** @type {{ action?: string }} */ (ta).action);
    if (!cat) {
      skipped.push({
        kind: "unclassified",
        action: String(/** @type {{ action?: string }} */ (ta).action || ""),
      });
      continue;
    }
    if (categories.includes(cat)) continue;
    categories.push(cat);
    if (categories.length >= 2) break;
  }

  if (categories.length === 0) {
    try {
      recordLedgerEventSafe({
        type: "autopilot",
        action: "auto_execution_skipped",
        status: "skipped",
        reason: "No executable categories from gap detector top actions",
      });
    } catch (_) {}
    touchLastRun(true, summary);
    return { success: true, executed, skipped, summary };
  }

  try {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "auto_execution_start",
      status: "info",
      reason: categories.join(", "),
      meta: { categories },
    });
  } catch (_) {}

  for (const cat of categories) {
    try {
      if (cat === "followup") {
        const r = await runFollowupExecutor();
        summary.followupsSent += Math.max(0, Math.floor(Number(r.sent) || 0));
        executed.push({ category: "followup", sent: r.sent, skipped: r.skipped, errors: r.errors });
      } else if (cat === "invoice") {
        const r = await runInvoiceExecutor();
        summary.invoicesCreated += Math.max(0, Math.floor(Number(r.created) || 0));
        executed.push({ category: "invoice", created: r.created, skipped: r.skipped, errors: r.errors });
      } else if (cat === "production") {
        const r = await runProductionExecutor();
        summary.productionMoves += Math.max(0, Math.floor(Number(r.advanced) || 0));
        executed.push({ category: "production", advanced: r.advanced, skipped: r.skipped, errors: r.errors });
      }
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      skipped.push({ kind: "executor_error", category: cat, reason: msg });
      try {
        recordLedgerEventSafe({
          type: "autopilot",
          action: "auto_execution_category_error",
          status: "blocked",
          reason: msg,
          meta: { category: cat },
        });
      } catch (_) {}
    }
  }

  try {
    recordLedgerEventSafe({
      type: "autopilot",
      action: "auto_execution_complete",
      status: "success",
      reason: `followups:${summary.followupsSent} invoices:${summary.invoicesCreated} production:${summary.productionMoves}`,
      meta: { categories },
    });
  } catch (_) {}

  touchLastRun(true, summary);
  return { success: true, executed, skipped, summary };
}

module.exports = {
  runAutoExecutionCycle,
  getLastAutoExecutionSnapshot,
};
