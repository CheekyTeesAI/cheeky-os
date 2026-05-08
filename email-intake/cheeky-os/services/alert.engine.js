"use strict";

/**
 * PHASE 4 — Alert Engine
 * Snapshot-derived alerts + optional merge from alertsService + kpiService.
 *
 * FAIL SAFE: Never throws. Returns [] on fatal error.
 * Output: { type, severity: "low"|"medium"|"high", message, source }
 */

function normalizeSeverity(s) {
  const x = String(s || "").toLowerCase();
  if (x === "critical") return "high";
  if (x === "high" || x === "medium" || x === "low") return x;
  if (x === "warning" || x === "attention") return "medium";
  return "medium";
}

function mapFollowupPriority(p) {
  return normalizeSeverity(p);
}

function mapProductionUrgency(label) {
  const u = String(label || "").toUpperCase();
  if (u === "CRITICAL") return "high";
  if (u === "HIGH") return "high";
  if (u === "ATTENTION") return "medium";
  return "medium";
}

/**
 * @param {object} pack - assembleAlerts shape from alertsService
 * @returns {Array<{type: string, severity: string, message: string, source: string}>}
 */
function flattenServiceAlerts(pack) {
  const out = [];
  if (!pack || typeof pack !== "object") return out;

  for (const u of pack.urgentFollowups || []) {
    out.push({
      type: `followup_${String(u.type || "urgent").replace(/\s+/g, "_")}`,
      severity: mapFollowupPriority(u.priority),
      message: `${u.customerName || "Customer"}: ${u.reason || "Urgent follow-up"}`,
      source: "alertsService",
    });
  }
  for (const p of pack.productionAlerts || []) {
    out.push({
      type: "production_queue",
      severity: mapProductionUrgency(p.urgencyLabel),
      message: `${p.customerName || ""} — ${p.alertReason || "Production"} (order ${p.orderId || ""})`.trim(),
      source: "alertsService",
    });
  }
  for (const c of pack.cashAlerts || []) {
    const daysOld = Number(c.daysOld) || 0;
    out.push({
      type: "cash_stale",
      severity: daysOld > 14 ? "high" : "medium",
      message: `${c.customerName || ""}: ${c.type || "item"} — ${daysOld}d old`,
      source: "alertsService",
    });
  }
  return out;
}

function dedupeAlerts(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    if (!a || !a.message) continue;
    const key = `${a.type}|${a.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: String(a.type || "unknown"),
      severity: normalizeSeverity(a.severity),
      message: String(a.message),
      source: String(a.source || "unknown"),
    });
  }
  return out;
}

function buildSnapshotAlertsSync(snapshot) {
  const alerts = [];
  try {
    const {
      unpaidInvoices = 0,
      overdueOrders = 0,
      revenueToday = 0,
      newOrdersLast24h = 0,
      ordersInProduction = 0,
      openOrders = 0,
      revenue7DayAvg = 0,
    } = snapshot || {};

    if (unpaidInvoices > 0) {
      alerts.push({
        type: "cash_risk",
        severity: unpaidInvoices >= 5 ? "high" : "high",
        message: `${unpaidInvoices} unpaid invoice${unpaidInvoices > 1 ? "s" : ""} outstanding — collect before production.`,
        source: "snapshot",
      });
    }

    if (revenueToday === 0) {
      alerts.push({
        type: "revenue_warning",
        severity: "medium",
        message: "No revenue recorded today. Push follow-ups or check Square sync.",
        source: "snapshot",
      });
    } else if (revenue7DayAvg > 0 && revenueToday < revenue7DayAvg * 0.5) {
      alerts.push({
        type: "revenue_below_avg",
        severity: "low",
        message: `Today's revenue ($${revenueToday.toFixed(0)}) is below 50% of 7-day average ($${revenue7DayAvg.toFixed(0)}).`,
        source: "snapshot",
      });
    }

    if (overdueOrders > 0) {
      alerts.push({
        type: "production_risk",
        severity: overdueOrders >= 3 ? "high" : "high",
        message: `${overdueOrders} order${overdueOrders > 1 ? "s" : ""} past due date — prioritize immediately.`,
        source: "snapshot",
      });
    }

    if (newOrdersLast24h === 0 && openOrders < 3) {
      alerts.push({
        type: "demand_warning",
        severity: "medium",
        message: "No new orders in 24h and low open order count. Run a sales push.",
        source: "snapshot",
      });
    }

    if (ordersInProduction >= 10) {
      alerts.push({
        type: "production_backlog",
        severity: "low",
        message: `${ordersInProduction} orders in production — review capacity and prioritize rush jobs.`,
        source: "snapshot",
      });
    }
  } catch (err) {
    console.warn("[alert.engine] sync alerts:", err && err.message ? err.message : err);
  }
  return alerts;
}

/**
 * @param {object} snapshot
 * @returns {Promise<Array<{type: string, severity: string, message: string, source: string}>>}
 */
async function generateAlerts(snapshot) {
  const merged = [];

  try {
    merged.push(...buildSnapshotAlertsSync(snapshot));

    let svc = null;
    try {
      svc = require("./alertsService");
    } catch (_) {}

    if (svc) {
      let extraPack = null;
      try {
        if (typeof svc.getAlertsToday === "function") {
          extraPack = await svc.getAlertsToday();
        } else if (typeof svc.getOwnerAlerts === "function") {
          extraPack = await svc.getOwnerAlerts();
        } else if (typeof svc.getAlerts === "function") {
          extraPack = await svc.getAlerts();
        } else if (typeof svc.getActiveAlerts === "function") {
          extraPack = await svc.getActiveAlerts();
        }
      } catch (e) {
        console.warn("[alert.engine] alertsService call failed:", e && e.message ? e.message : e);
      }
      if (extraPack) {
        if (Array.isArray(extraPack)) {
          for (const item of extraPack) {
            merged.push({
              type: item.type || "external_alert",
              severity: item.severity || "medium",
              message: item.message || JSON.stringify(item).slice(0, 200),
              source: "alertsService",
            });
          }
        } else {
          merged.push(...flattenServiceAlerts(extraPack));
        }
      }
    }

    let kpiMod = null;
    try {
      kpiMod = require("./kpiService");
    } catch (_) {}

    if (kpiMod && typeof kpiMod.getFounderKpiSnapshot === "function") {
      try {
        const kpi = await kpiMod.getFounderKpiSnapshot();
        if (kpi && kpi.highlights) {
          const h = String(kpi.highlights.systemHealth || "").toLowerCase();
          if (h === "critical") {
            merged.push({
              type: "kpi_system_health",
              severity: "high",
              message: "Founder KPI snapshot reports critical system health.",
              source: "kpiService",
            });
          } else if (h === "warning") {
            merged.push({
              type: "kpi_system_health",
              severity: "medium",
              message: "Founder KPI snapshot reports warning-level system health.",
              source: "kpiService",
            });
          }
        }
        if (kpi && kpi.today && Number(kpi.today.criticalAlerts) > 0) {
          merged.push({
            type: "kpi_critical_alerts",
            severity: "high",
            message: `${kpi.today.criticalAlerts} critical alert(s) recorded in KPI ledger today.`,
            source: "kpiService",
          });
        }
      } catch (e) {
        console.warn("[alert.engine] kpiService failed:", e && e.message ? e.message : e);
      }
    }
  } catch (err) {
    console.warn("[alert.engine] error generating alerts:", err && err.message ? err.message : err);
  }

  return dedupeAlerts(merged);
}

module.exports = { generateAlerts, buildSnapshotAlertsSync, flattenServiceAlerts, dedupeAlerts };
