"use strict";

/**
 * Cash risk ranking — read-only heuristics over Order/Quote-shaped rows.
 */

const HIGH_VALUE_USD = Number(process.env.CHEEKY_HIGH_VALUE_QUOTE_USD || 800);
const MS_DAY = 86400000;

function effectiveTotal(o) {
  const q = Number(o.quotedAmount || 0);
  const t = Number(o.totalAmount || o.total || o.amountTotal || 0);
  return q > 0 ? q : t > 0 ? t : 0;
}

function effectiveDepositRequired(o) {
  const dr = Number(o.depositRequired || 0);
  const tot = effectiveTotal(o);
  if (dr > 0) return dr;
  if (tot > 0) return Math.round(tot * 0.5 * 100) / 100;
  return 0;
}

function depositCollected(o) {
  const paid = Number(o.amountPaid || 0);
  const req = effectiveDepositRequired(o);
  const st = String(o.depositStatus || "").toUpperCase();
  if (st === "PAID" || o.depositPaid === true || o.depositReceived === true) return true;
  if (req > 0 && paid + 1e-6 >= req) return true;
  const ost = String(o.status || "").toUpperCase();
  if (ost === "DEPOSIT_PAID" || ost === "PAID_IN_FULL") return true;
  return false;
}

function needsBlanks(o) {
  if (o.garmentsOrdered === true) return false;
  const gs = String(o.garmentOrderStatus || "").toUpperCase();
  if (gs && gs !== "NOT_ORDERED" && gs !== "NONE" && gs !== "") return true;
  const st = String(o.status || "").toUpperCase();
  if (st === "PRODUCTION_READY" || st === "PRINTING" || st === "PRODUCTION") return true;
  if (o.jobCreated && !o.garmentsOrdered) return true;
  return false;
}

/**
 * @param {object} params
 * @param {object[]} params.orders
 * @param {object[]} [params.quotes]
 * @returns {{ riskLevel: string, risks: object[], recommendedActions: object[] }}
 */
function getCashRisks(params) {
  const orders = Array.isArray(params.orders) ? params.orders : [];
  const quotes = Array.isArray(params.quotes) ? params.quotes : [];
  const now = Date.now();
  const risks = [];
  const recommendedActions = [];

  for (const o of orders) {
    if (o.deletedAt) continue;
    const id = o.id;
    const label = o.customerName || id;
    const hasDep = depositCollected(o);

    if (!hasDep && !["PAID_IN_FULL", "COMPLETED", "CANCELLED", "BLOCKED"].includes(String(o.status || "").toUpperCase())) {
      risks.push({
        code: "BLOCKED",
        severity: "HIGH",
        rule: "no_deposit",
        orderId: id,
        customerName: o.customerName,
        status: o.status,
        detail: "Order without collected deposit",
      });
    }

    if (needsBlanks(o) && !hasDep) {
      risks.push({
        code: "CASH_RISK",
        severity: "CRITICAL",
        rule: "blanks_without_deposit",
        orderId: id,
        customerName: o.customerName,
        detail: "Production/blanks path implied but deposit not collected",
      });
      recommendedActions.push({
        action: "COLLECT_DEPOSIT_BEFORE_BLANKS",
        orderId: id,
        customerName: label,
        priority: 1,
      });
    }
  }

  const quoteCutoff = now - 48 * MS_DAY;
  for (const q of quotes) {
    const ord = q.order || {};
    if (ord.deletedAt) continue;
    const created = q.createdAt ? new Date(q.createdAt).getTime() : 0;
    const qst = String(q.status || "").toUpperCase();
    if (created < quoteCutoff && ["SENT", "OPEN", "DRAFT", "PENDING"].includes(qst) && !depositCollected(ord)) {
      risks.push({
        code: "FOLLOW_UP",
        severity: "MEDIUM",
        rule: "stale_unpaid_quote_48h",
        quoteId: q.id,
        orderId: ord.id,
        customerName: ord.customerName,
        detail: "Quote or estimate path unpaid > 48h",
      });
      const nameHint = ord.customerName || ord.id || "customer";
      recommendedActions.push({
        action: "FOLLOW_UP_QUOTE",
        quoteId: q.id,
        orderId: ord.id || null,
        customerName: nameHint,
        priority: 3,
      });
    }
  }

  for (const o of orders) {
    if (o.deletedAt) continue;
    const exp = o.invoiceExpiresAt || o.quoteExpiresAt;
    if (!exp) continue;
    const expMs = new Date(exp).getTime();
    if (Number.isNaN(expMs)) continue;
    const total = effectiveTotal(o);
    const paid = Number(o.amountPaid || 0);
    if (expMs < now && paid + 1e-6 < total) {
      const days = Math.floor((now - expMs) / MS_DAY);
      risks.push({
        code: "COLLECT",
        severity: days > 7 ? "CRITICAL" : "HIGH",
        rule: "overdue_balance",
        orderId: o.id,
        customerName: o.customerName,
        balanceUsd: Math.max(0, total - paid),
        daysOverdue: days,
        detail: "Invoice/quote expiry passed with balance due",
      });
      recommendedActions.push({
        action: "COLLECT_OVERDUE",
        orderId: o.id,
        customerName: o.customerName,
        amountUsd: Math.max(0, total - paid),
        priority: 1,
      });
    }
  }

  for (const o of orders) {
    if (o.deletedAt) continue;
    const total = effectiveTotal(o);
    if (total < HIGH_VALUE_USD) continue;
    if (depositCollected(o)) continue;
    const ost = String(o.status || "").toUpperCase();
    if (["COMPLETED", "CANCELLED"].includes(ost)) continue;
    risks.push({
      code: "PRIORITY",
      severity: "HIGH",
      rule: "high_value_unpaid",
      orderId: o.id,
      customerName: o.customerName,
      totalUsd: total,
      detail: `Unpaid or under-deposit order ≥ $${HIGH_VALUE_USD}`,
    });
    recommendedActions.push({
      action: "PRIORITY_COLLECT_HIGH_VALUE",
      orderId: o.id,
      customerName: o.customerName,
      totalUsd: total,
      priority: 2,
    });
  }

  let riskLevel = "LOW";
  const crit = risks.filter((r) => r.severity === "CRITICAL").length;
  const high = risks.filter((r) => r.severity === "HIGH").length;
  const med = risks.filter((r) => r.severity === "MEDIUM").length;
  if (crit >= 2 || (crit >= 1 && high >= 2)) riskLevel = "CRITICAL";
  else if (crit >= 1 || high >= 3) riskLevel = "HIGH";
  else if (high >= 1 || med >= 3) riskLevel = "MEDIUM";
  else if (risks.length > 0) riskLevel = "LOW";

  recommendedActions.sort((a, b) => (a.priority || 9) - (b.priority || 9));

  return {
    riskLevel,
    risks,
    recommendedActions: recommendedActions.slice(0, 25),
  };
}

module.exports = {
  getCashRisks,
  effectiveTotal,
  effectiveDepositRequired,
  depositCollected,
  needsBlanks,
  HIGH_VALUE_USD,
};
