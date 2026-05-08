"use strict";

/**
 * PHASE 5 — AI Decision Engine
 * Pure logic — no DB calls, no external services.
 * Reads a snapshot, returns today's priority directive + action list.
 *
 * FAIL SAFE: Always returns a valid directive. Never throws.
 * NO AUTO-SEND.
 */

const PRIORITIES = {
  CASH: "COLLECT CASH",
  SALES: "DRIVE SALES",
  PRODUCTION: "CLEAR PRODUCTION",
  OPERATIONS: "DAILY OPERATIONS",
};

/**
 * Evaluate snapshot and return the daily AI directive.
 *
 * Priority logic:
 *   1. Unpaid invoices present          → COLLECT CASH
 *   2. Overdue orders                   → CLEAR PRODUCTION
 *   3. No new orders + low open count   → DRIVE SALES
 *   4. Production backlog high          → CLEAR PRODUCTION
 *   5. Default                          → DAILY OPERATIONS
 *
 * @param {object} snapshot
 * @returns {{ priority: string, mode: string, actions: string[], insights: string[], confidence: string }}
 */
function getDailyDirective(snapshot) {
  try {
    const {
      revenueToday = 0,
      revenue7DayAvg = 0,
      openOrders = 0,
      ordersInProduction = 0,
      overdueOrders = 0,
      unpaidInvoices = 0,
      newOrdersLast24h = 0,
      alerts = [],
    } = snapshot || {};

    let priority = PRIORITIES.OPERATIONS;
    let mode = "balanced";
    const actions = [];
    const insights = [];

    // ── Rule 1: Cash first ────────────────────────────────────────────────────
    if (unpaidInvoices > 0) {
      priority = PRIORITIES.CASH;
      mode = "cash_aggressive";
      actions.push(`Call top ${Math.min(unpaidInvoices, 5)} customers with unpaid invoices.`);
      actions.push("Send Square invoice reminders for all outstanding balances.");
      actions.push("Do NOT start production on any order without confirmed deposit.");
      insights.push(`${unpaidInvoices} unpaid invoice(s) represent blocked revenue. Collect before end of day.`);
    }

    // ── Rule 2: Overdue orders ────────────────────────────────────────────────
    if (overdueOrders > 0) {
      if (priority === PRIORITIES.OPERATIONS) {
        priority = PRIORITIES.PRODUCTION;
        mode = "production_urgent";
      }
      actions.push(`Immediately review ${overdueOrders} past-due order(s) — reassign if needed.`);
      actions.push("Run /api/activation/today to get Jeremy's current priority list.");
      insights.push("Overdue orders damage customer trust and referrals. Clear these first.");
    }

    // ── Rule 3: No new orders / low pipeline ──────────────────────────────────
    if (newOrdersLast24h === 0 && openOrders < 5) {
      if (priority === PRIORITIES.OPERATIONS) {
        priority = PRIORITIES.SALES;
        mode = "sales_push";
      }
      actions.push("Post to social media (Instagram + Facebook) with recent work.");
      actions.push("Send reactivation outreach to customers from last 60-90 days.");
      actions.push("Follow up on all open quotes and estimates.");
      insights.push("Pipeline is thin. Sales activity must happen today.");
    }

    // ── Rule 4: Production backlog ────────────────────────────────────────────
    if (ordersInProduction >= 8 && priority === PRIORITIES.OPERATIONS) {
      priority = PRIORITIES.PRODUCTION;
      mode = "production_focus";
      actions.push("Review production queue — complete oldest jobs first.");
      actions.push("Check Jeremy's task list at /api/activation/jeremy.");
      insights.push(`${ordersInProduction} orders in production. Stay focused on throughput.`);
    }

    // ── Default actions (always included) ─────────────────────────────────────
    if (actions.length === 0) {
      actions.push("Review open orders and confirm all have art files approved.");
      actions.push("Check for any new estimate requests to quote today.");
      actions.push("Verify production is moving — check Jeremy's queue.");
    }

    // ── Revenue insight ───────────────────────────────────────────────────────
    if (revenueToday > 0) {
      insights.push(`$${revenueToday.toFixed(2)} collected today${revenue7DayAvg > 0 ? ` (7-day avg: $${revenue7DayAvg.toFixed(2)}/day)` : ""}.`);
    } else {
      insights.push("No revenue recorded yet today. Prioritize collections and closes.");
    }

    // ── Alert summary ─────────────────────────────────────────────────────────
    const criticalAlerts = (alerts || []).filter((a) => {
      const s = String((a && a.severity) || "").toLowerCase();
      return s === "critical" || s === "high";
    });
    if (criticalAlerts.length > 0) {
      insights.push(`${criticalAlerts.length} critical alert(s) require immediate attention.`);
    }

    return {
      priority,
      mode,
      actions: actions.slice(0, 5),  // top 5 actions max
      insights,
      confidence: actions.length > 0 ? "high" : "low",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[ai.decision] error — returning safe default:", err && err.message ? err.message : err);
    return {
      priority: PRIORITIES.OPERATIONS,
      mode: "safe_default",
      actions: ["Check system status.", "Review open orders.", "Follow up on pending quotes."],
      insights: ["Decision engine encountered an error — verify snapshot data."],
      confidence: "low",
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = { getDailyDirective };
