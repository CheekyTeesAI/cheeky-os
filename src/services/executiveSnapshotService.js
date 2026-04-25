/**
 * Top-level executive snapshot — orchestrates engines + plain-English summary.
 */
const { loadExecutiveContext } = require("./executiveContextService");
const { analyzeCashflow } = require("./cashflowEngine");
const { analyzeRisks } = require("./riskEngine");
const { analyzeOpportunities } = require("./opportunityEngine");
const { generateExecutiveActions } = require("./executiveActionEngine");
const { buildDailyFocus } = require("./dailyFocusEngine");
const { getSystemStatus } = require("./statusEngine");

async function logExec(message) {
  try {
    const { logEvent } = require("./foundationEventLog");
    await logEvent(null, "EXECUTIVE", String(message || ""));
  } catch (_e) {
    console.log("[EXECUTIVE]", message);
  }
}

function buildPlainSummary(cashflow, risks, dailyFocus, mock) {
  const parts = [];
  const out = num(cashflow && cashflow.totalOutstanding);
  if (Number.isFinite(out) && out > 0) {
    parts.push(`Roughly $${Math.round(out)} outstanding across open invoices (verify in Square).`);
  } else {
    parts.push("Outstanding total unavailable or zero — confirm in Square.");
  }
  const crit = (risks && risks.criticalRisks && risks.criticalRisks.length) || 0;
  if (crit > 0) parts.push(`${crit} job(s) look past due — handle dates before new work.`);
  const md = (dailyFocus && dailyFocus.mustDo && dailyFocus.mustDo.length) || 0;
  if (md > 0) parts.push(`Must-do today: ${md} item(s) — cash and deadlines first.`);
  if (mock) parts.push("Some data is mock or degraded — treat numbers as directional.");
  return parts.join(" ");
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

async function buildExecutiveSnapshot() {
  await logExec("executive snapshot run started");

  let ctx;
  try {
    ctx = await loadExecutiveContext();
  } catch (e) {
    await logExec(`executive context failed: ${e && e.message ? e.message : e}`);
    ctx = {
      jobs: [],
      squareBundle: {},
      intakeSnapshot: {},
      intakeRecords: [],
      weeklyPlan: null,
      production: {},
      purchasePlan: null,
      outbound: {},
      communications: { recommendations: [], meta: {} },
      partial: ["full_context_load_failed"],
      assumptions: [],
      mock: true,
    };
  }

  const cashflow = await analyzeCashflow(ctx);
  const risks = await analyzeRisks(ctx);
  const opportunities = await analyzeOpportunities(ctx);
  const actions = await generateExecutiveActions(ctx, cashflow, risks, opportunities);
  const dailyFocus = buildDailyFocus(actions, risks, cashflow, opportunities);

  await logExec(
    `actions=${actions.length} risks_critical=${(risks.criticalRisks || []).length} opportunities=${(opportunities.highValueOpportunities || []).length}`
  );

  let systemHealth = {};
  try {
    systemHealth = getSystemStatus();
  } catch (_e) {
    systemHealth = { health: "UNKNOWN", mockMode: true };
  }

  const assumptions = [
    ...(cashflow.assumptions || []),
    `Partial flags: ${(ctx.partial || []).join(", ") || "none"}`,
  ];

  const summary = buildPlainSummary(cashflow, risks, dailyFocus, Boolean(ctx.mock));

  const snapshot = {
    summary,
    cashflow,
    risks,
    opportunities,
    actions,
    dailyFocus,
    systemHealth: {
      health: systemHealth.health,
      mockMode: systemHealth.mockMode,
      dataConnected: systemHealth.dataConnected,
      missingKeys: systemHealth.missingKeys,
    },
    assumptions,
    mock: Boolean(ctx.mock),
    partialData: ctx.partial || [],
  };

  await logExec("executive snapshot run complete");
  return snapshot;
}

module.exports = {
  buildExecutiveSnapshot,
};
