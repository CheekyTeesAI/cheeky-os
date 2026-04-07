/**
 * Bundle 34 — daily autonomous runbook (orchestration only; no notification auto-send).
 */

const fs = require("fs");
const path = require("path");
const { runSystemCheck } = require("./systemCheckService");
const { runSalesOperatorCycle } = require("./salesOperatorService");
const { runInvoiceExecutor } = require("./invoiceExecutorService");
const { runProductionExecutor } = require("./productionExecutorService");
const { getActiveAlertsSorted } = require("./alertStoreService");
const { canRun } = require("./autopilotGuardService");

const LAST_RUN_FILE = path.join(__dirname, "..", "data", "runbook-last-run.json");

/**
 * @returns {{ at?: string, summary?: object, events?: string[], steps?: object[] } | null}
 */
function readLastRunbookRun() {
  try {
    const txt = fs.readFileSync(LAST_RUN_FILE, "utf8");
    const j = JSON.parse(txt);
    if (j && typeof j === "object") return j;
  } catch (_) {}
  return null;
}

/**
 * @param {{ at: string, steps: object[], summary: object, events: string[] }} payload
 */
function writeLastRunbookRun(payload) {
  const dir = path.dirname(LAST_RUN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LAST_RUN_FILE, JSON.stringify(payload, null, 2), "utf8");
}

/**
 * @returns {Promise<{ steps: object[], summary: object, events: string[] }>}
 */
async function executeDailyRunbook() {
  /** @type {object[]} */
  const steps = [];
  /** @type {string[]} */
  const events = [];
  /** @type {{ followups: number, invoices: number, productionMoves: number, alerts: number }} */
  const summary = {
    followups: 0,
    invoices: 0,
    productionMoves: 0,
    alerts: 0,
  };
  const gate = canRun("full_runbook_execute");
  if (!gate.allowed) {
    const out = {
      steps: [{ step: "runbook_guard", ok: false, reason: gate.reason }],
      summary,
      events: [`Runbook blocked: ${gate.reason}`],
    };
    writeLastRunbookRun({
      at: new Date().toISOString(),
      steps: out.steps,
      summary: out.summary,
      events: out.events,
    });
    return out;
  }

  try {
    await runSystemCheck();
    steps.push({ step: "system_check", ok: true });
    events.push("System check complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "system_check", ok: false, error: msg });
    events.push(`System check error (continuing): ${msg.slice(0, 120)}`);
  }

  try {
    const sales = await runSalesOperatorCycle({});
    const cs = sales.cycleSummary || {};
    summary.followups = Math.max(0, Math.floor(Number(cs.followupsSent) || 0));
    steps.push({ step: "sales_operator", ok: true });
    if (summary.followups > 0) {
      events.push(`${summary.followups} follow-up(s) sent`);
    } else {
      events.push("No follow-ups sent this run");
    }
    const rp = Math.floor(Number(cs.responsesProcessed) || 0);
    if (rp > 0) {
      events.push(`${rp} response(s) processed`);
    }
    const ir = Math.floor(Number(cs.invoicesPrepared) || 0);
    if (ir > 0) {
      events.push(`${ir} invoice-ready signal(s) from replies`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "sales_operator", ok: false, error: msg });
    events.push(`Sales operator error: ${msg.slice(0, 120)}`);
  }

  try {
    const inv = await runInvoiceExecutor();
    summary.invoices = Math.max(0, Math.floor(Number(inv.created) || 0));
    steps.push({ step: "invoice_executor", ok: true });
    if (summary.invoices > 0) {
      events.push(`${summary.invoices} draft invoice(s) created`);
    } else {
      events.push("No draft invoices created");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "invoice_executor", ok: false, error: msg });
    events.push(`Invoice executor error: ${msg.slice(0, 120)}`);
  }

  try {
    const prod = await runProductionExecutor();
    summary.productionMoves = Math.max(0, Math.floor(Number(prod.advanced) || 0));
    steps.push({ step: "production_executor", ok: true });
    if (summary.productionMoves > 0) {
      events.push(`${summary.productionMoves} job(s) advanced in production`);
    } else {
      events.push("No production moves this run");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "production_executor", ok: false, error: msg });
    events.push(`Production executor error: ${msg.slice(0, 120)}`);
  }

  try {
    const sorted = getActiveAlertsSorted();
    summary.alerts = sorted.length;
    steps.push({ step: "alerts_review", ok: true });
    events.push(`${summary.alerts} alert(s) active`);
    const critical = sorted.filter(
      (a) =>
        a &&
        String(a.severity || "").toLowerCase() === "critical"
    );
    if (critical.length > 0) {
      events.push(
        `${critical.length} CRITICAL alert(s) — notifications not auto-sent (use Send Alerts when ready)`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push({ step: "alerts_review", ok: false, error: msg });
    events.push(`Alerts review error: ${msg.slice(0, 120)}`);
  }

  const out = { steps, summary, events };
  writeLastRunbookRun({
    at: new Date().toISOString(),
    steps: out.steps,
    summary: out.summary,
    events: out.events,
  });
  return out;
}

module.exports = {
  executeDailyRunbook,
  readLastRunbookRun,
};
