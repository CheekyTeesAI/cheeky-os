"use strict";

const draftHelpers = require("../drafting/draftOrderHelpers");
const approvalGateService = require("../approvals/approvalGateService");
const frictionLogService = require("../ops/frictionLogService");
const kpiService = require("../kpi/kpiService");

function csvEscape(s) {
  const t = String(s == null ? "" : s);
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function rowsToCsv(header, rows) {
  const lines = [header.map(csvEscape).join(",")];
  rows.forEach((cells) => {
    lines.push(cells.map(csvEscape).join(","));
  });
  return `${lines.join("\r\n")}\r\n`;
}

async function csvOrders(limit) {
  const take = Math.min(800, Math.max(12, Number(limit) || 400));
  const orders = await draftHelpers.loadOrdersForDrafts(take);
  const hdr = ["id", "customerName", "email", "orderNumber", "status", "amountPaidApprox", "totalQuotedApprox"];
  if (!orders.length) return rowsToCsv(hdr, [["insufficient_data", "", "", "", "", "", ""]]);
  /** @type {string[][]} */
  const rows = [];
  orders.forEach((o) => {
    if (!o) return;
    rows.push([
      String(o.id || ""),
      String(o.customerName || ""),
      String(o.email || ""),
      String(o.orderNumber || ""),
      String(o.status || ""),
      o.amountPaid != null ? Number(o.amountPaid) : "",
      Number(
        o.totalAmount != null ? o.totalAmount : o.total != null ? o.total : o.quotedAmount != null ? o.quotedAmount : ""
      ),
    ]);
  });
  return rowsToCsv(hdr, rows);
}

async function csvCustomers(limit) {
  const take = Math.min(900, Math.max(20, Number(limit) || 500));
  const orders = await draftHelpers.loadOrdersForDrafts(take);
  const map = new Map();
  orders.forEach((o) => {
    if (!o || !String(o.email || "").trim()) return;
    const key = String(o.email || "")
      .trim()
      .toLowerCase();
    if (!map.has(key))
      map.set(key, {
        email: key,
        name: String(o.customerName || ""),
        ordersSampled: 0,
      });
    const row = map.get(key);
    row.ordersSampled += 1;
  });
  const hdr = ["email", "customerName", "ordersSampledInExport"];
  const rows = [...map.values()].map((m) => [m.email, m.name, String(m.ordersSampled)]);
  if (!rows.length) return rowsToCsv(hdr, [["unknown", "", "0"]]);
  return rowsToCsv(hdr, rows);
}

async function csvKpisTail() {
  const entries = kpiService.readHistoryEntries().slice(-30);
  const hdr = ["dayKeyTs", "revenue30dUsd", "approvalsPending", "outreachDraftCount"];
  const rows = entries.map((e) => [
    `${e.dayKey || ""}:${e.ts || ""}`,
    String((e.snapshot && e.snapshot.revenue30dUsd) || ""),
    String((e.snapshot && e.snapshot.approvalsPending) || ""),
    String((e.snapshot && e.snapshot.outreachDraftCount) || ""),
  ]);
  if (!rows.length) return rowsToCsv(hdr, [["insufficient_history", "", "", ""]]);
  return rowsToCsv(hdr, rows);
}

async function csvApprovals() {
  const hist = approvalGateService.getApprovalHistory(400);
  const hdr = ["id", "createdAt", "status", "actionType", "customer"];
  const rows = hist.map((a) => [
    a.id || "",
    a.createdAt || "",
    a.status || "",
    a.actionType || "",
    (a.customer || "").slice(0, 240),
  ]);
  if (!rows.length) return rowsToCsv(hdr, [["placeholder", "", "empty_gate", "", ""]]);
  return rowsToCsv(hdr, rows.slice(-340));
}

async function csvFriction() {
  const rowsRaw = frictionLogService.tailRecent(600);
  const hdr = ["ts", "area", "severity", "descriptionSnippet", "whoNoticed"];
  const rows = rowsRaw.map((r) => [
    String(r.ts || ""),
    String(r.area || ""),
    String(r.severity || ""),
    String(r.description || "").slice(0, 400),
    String(r.whoNoticed || "").slice(0, 220),
  ]);
  return rows.length ? rowsToCsv(hdr, rows) : rowsToCsv(hdr, [["insufficient_logs", "", "low", "", ""]]);
}

async function buildAccountingPrepCsv() {
  const orders = await draftHelpers.loadOrdersForDrafts(320);
  const hdr = ["dayKeyUtc", "idShort", "customer", "email", "quotedUsd", "paidUsdHeuristic"];
  const rows = [];
  orders.forEach((o) => {
    if (!o) return;
    const paid = Number(o.amountPaid || 0);
    const quoted = Number(o.totalAmount != null ? o.totalAmount : o.quotedAmount || 0);
    const dIso = String(o.completedAt || o.finalPaidAt || o.updatedAt || "").slice(0, 50);
    rows.push([
      dIso || "unknown_date",
      String(o.id || "").slice(0, 16),
      String(o.customerName || ""),
      String(o.email || ""),
      quoted,
      paid,
    ]);
  });
  return rowsToCsv(hdr, rows.length ? rows : [["unknown_date", "", "", "", "", ""]]);
}

async function summarizeWeeklyMonthly() {
  const now = Date.now();
  const weekCut = now - 7 * 86400000;

  /** @type {object[]} */
  const orders = await draftHelpers.loadOrdersForDrafts(600);
  const reachable = Array.isArray(orders) && orders.length > 0;

  /** @type {object[]} */
  const weekTouches = [];

  orders.forEach((o) => {
    if (!o) return;
    const t = o.updatedAt ? new Date(o.updatedAt).getTime() : NaN;
    if (!Number.isFinite(t)) return;
    if (t >= weekCut) weekTouches.push(o);
  });

  /** @type {object|null} */
  let kpi = null;
  try {
    kpi = await kpiService.buildKpiSummary();
  } catch (_e) {}

  const pend = approvalGateService.getPendingApprovals().length;

  function monthWindowLabel() {
    const d = new Date();
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  return {
    generatedAt: new Date().toISOString(),
    prismaReachable: reachable,
    week: {
      label: `${new Date(now).toISOString().slice(0, 10)} week window heuristic`,
      updatedOrdersCounted: weekTouches.length || "insufficient_touch_data",
      note: reachable ? "Touches measured via Prisma updatedAt only — not invoicing truth." : "Orders missing — KPI layer may be degraded.",
      approvalsPending: pend,
      kpiAnchorsPresent: !!(kpi && kpi.snapshot),
    },
    month: {
      label: monthWindowLabel(),
      kpiCoverageDays: kpi ? kpi.historyCoverageDays : "unknown",
      approvalsPendingMirror: pend,
    },
    guardrailEcho: "Operational exports only — never trust CSV over Square + bank reconciliation.",
  };
}

async function csvByType(kind, limitParam) {
  const k = String(kind || "").toLowerCase();

  switch (k) {
    case "orders":
      return csvOrders(limitParam);
    case "customers":
      return csvCustomers(limitParam);
    case "kpis":
      return csvKpisTail();
    case "approvals":
      return csvApprovals();
    case "friction":
      return csvFriction();
    case "accounting-rows":
      return buildAccountingPrepCsv();
    default:
      return csvToCsvInsufficient();
  }
}

function csvToCsvInsufficient() {
  return rowsToCsv(["warning"], [["unknown_export_kind"]]);
}

module.exports = {
  summarizeWeeklyMonthly,
  csvByType,
  csvOrders,
};
