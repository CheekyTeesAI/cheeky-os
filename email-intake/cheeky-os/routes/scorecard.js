/**
 * Bundle 42 — founder KPI and weekly scorecard endpoints + panel renderer.
 */

const { Router } = require("express");
const { getFounderKpiSnapshot } = require("../services/kpiService");

const router = Router();

router.get("/scorecard/weekly", async (_req, res) => {
  try {
    const out = await getFounderKpiSnapshot();
    return res.json(out);
  } catch (err) {
    console.error("[scorecard/weekly]", err.message || err);
    return res.json({
      today: {
        followupsSent: 0,
        draftInvoicesCreated: 0,
        productionMoves: 0,
        criticalAlerts: 0,
        cashPriorityCount: 0,
        depositPriorityCount: 0,
      },
      week: {
        followupsSent: 0,
        draftInvoicesCreated: 0,
        productionMoves: 0,
        approvedExceptions: 0,
        blockedActions: 0,
      },
      highlights: {
        topCashOpportunity: "",
        topDepositOpportunity: "",
        systemHealth: "warning",
      },
    });
  }
});

router.get("/kpi/today", async (_req, res) => {
  try {
    const out = await getFounderKpiSnapshot();
    return res.json({
      today: out.today || {},
      highlights: out.highlights || {},
    });
  } catch (err) {
    console.error("[kpi/today]", err.message || err);
    return res.json({
      today: {
        followupsSent: 0,
        draftInvoicesCreated: 0,
        productionMoves: 0,
        criticalAlerts: 0,
        cashPriorityCount: 0,
        depositPriorityCount: 0,
      },
      highlights: {
        topCashOpportunity: "",
        topDepositOpportunity: "",
        systemHealth: "warning",
      },
    });
  }
});

/**
 * @param {(s: unknown) => string} esc
 * @param {object} kpi
 */
function founderKpiSnapshotSectionHtml(esc, kpi) {
  const today = (kpi && kpi.today) || {};
  const week = (kpi && kpi.week) || {};
  const hi = (kpi && kpi.highlights) || {};

  const allNums = [
    Number(today.followupsSent) || 0,
    Number(today.draftInvoicesCreated) || 0,
    Number(today.productionMoves) || 0,
    Number(today.criticalAlerts) || 0,
    Number(today.cashPriorityCount) || 0,
    Number(today.depositPriorityCount) || 0,
    Number(week.followupsSent) || 0,
    Number(week.draftInvoicesCreated) || 0,
    Number(week.productionMoves) || 0,
    Number(week.approvedExceptions) || 0,
    Number(week.blockedActions) || 0,
  ];
  const hasData =
    allNums.some((n) => n > 0) ||
    String(hi.topCashOpportunity || "").trim() ||
    String(hi.topDepositOpportunity || "").trim();

  if (!hasData) {
    return (
      '<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0f172a;border:1px solid #334155;">' +
      '<h2 style="font-size:1.02rem;margin:0 0 8px;color:#93c5fd;font-weight:800;">📈 FOUNDER KPI SNAPSHOT</h2>' +
      '<p style="margin:0;font-size:0.9rem;opacity:0.78;line-height:1.45;">No KPI data recorded yet</p>' +
      "</section>"
    );
  }

  const systemHealth = String(hi.systemHealth || "good").toLowerCase();
  const healthColor =
    systemHealth === "critical"
      ? "#ef4444"
      : systemHealth === "warning"
        ? "#f59e0b"
        : "#22c55e";
  const healthBg =
    systemHealth === "critical"
      ? "#450a0a"
      : systemHealth === "warning"
        ? "#422006"
        : "#052e16";

  function stat(label, value, color) {
    return `<div style="background:#101010;border:1px solid #333;border-radius:10px;padding:10px;">
      <div style="font-size:0.68rem;opacity:0.7;">${esc(label)}</div>
      <div style="margin-top:4px;font-size:1.05rem;font-weight:900;color:${color || "#e5e7eb"};">${esc(String(value))}</div>
    </div>`;
  }

  return `<section style="margin:0 0 18px 0;padding:16px;border-radius:16px;background:#0b1220;border:1px solid #1d4ed8;">
    <h2 style="font-size:1.02rem;margin:0 0 10px;color:#93c5fd;font-weight:800;">📈 FOUNDER KPI SNAPSHOT</h2>
    <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.05em;opacity:0.78;margin-bottom:8px;">TODAY</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      ${stat("Follow-ups Sent", Number(today.followupsSent) || 0, "#86efac")}
      ${stat("Draft Invoices", Number(today.draftInvoicesCreated) || 0, "#fde047")}
      ${stat("Production Moves", Number(today.productionMoves) || 0, "#7dd3fc")}
      ${stat("Critical Alerts", Number(today.criticalAlerts) || 0, "#fca5a5")}
      ${stat("Cash Priorities", Number(today.cashPriorityCount) || 0, "#86efac")}
      ${stat("Deposit Priorities", Number(today.depositPriorityCount) || 0, "#a5f3fc")}
    </div>

    <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.05em;opacity:0.78;margin:12px 0 8px;">WEEK</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
      ${stat("Follow-ups Sent", Number(week.followupsSent) || 0, "#86efac")}
      ${stat("Draft Invoices", Number(week.draftInvoicesCreated) || 0, "#fde047")}
      ${stat("Production Moves", Number(week.productionMoves) || 0, "#7dd3fc")}
      ${stat("Approved Exceptions", Number(week.approvedExceptions) || 0, "#bbf7d0")}
      ${stat("Blocked Actions", Number(week.blockedActions) || 0, "#fca5a5")}
    </div>

    <div style="font-size:0.72rem;font-weight:800;letter-spacing:0.05em;opacity:0.78;margin:12px 0 8px;">HIGHLIGHTS</div>
    <div style="background:#101010;border:1px solid #333;border-radius:10px;padding:10px;">
      <div style="font-size:0.8rem;line-height:1.45;"><span style="opacity:0.72;">Top Cash Opportunity:</span> <strong>${esc(String(hi.topCashOpportunity || "—"))}</strong></div>
      <div style="font-size:0.8rem;line-height:1.45;margin-top:4px;"><span style="opacity:0.72;">Top Deposit Opportunity:</span> <strong>${esc(String(hi.topDepositOpportunity || "—"))}</strong></div>
      <div style="margin-top:8px;padding:8px;border-radius:8px;background:${healthBg};border:1px solid ${healthColor};font-size:0.8rem;font-weight:900;color:${healthColor};">
        System Health: ${esc(systemHealth.toUpperCase())}
      </div>
    </div>
  </section>`;
}

module.exports = {
  router,
  founderKpiSnapshotSectionHtml,
};
