"use strict";

/**
 * Read-only accounting-ish visibility derived from cockpit Prisma snapshots.
 * Never syncs QuickBooks/Xero/tax filings — placeholders only beyond JSON math.
 */

const draftHelpers = require("../drafting/draftOrderHelpers");
const wf = require("../workflow/orderWorkflowRules");
const kpiService = require("../kpi/kpiService");

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * @param {Date} anchor
 */
function isoMonthAnchor(anchor) {
  try {
    return `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, "0")}`;
  } catch (_e) {
    return "unknown";
  }
}

async function summarizeAccounts() {
  const generatedAt = new Date().toISOString();
  const orders = await draftHelpers.loadOrdersForDrafts(700);
  const reachable = Array.isArray(orders) && orders.length > 0;

  let outstandingApprox = 0;
  /** @type {Record<string,{count:number,outstandingUsd:number}>} */
  const agingBuckets = {
    open_sample: { count: 0, outstandingUsd: 0 },
    thirty_plus: { count: 0, outstandingUsd: 0 },
    sixty_plus: { count: 0, outstandingUsd: 0 },
  };

  const now = Date.now();
  orders.forEach((o) => {
    if (!o) return;
    const tot =
      Number(
        o.totalAmount != null ? o.totalAmount : o.total != null ? o.total : o.quotedAmount != null ? o.quotedAmount : 0
      ) || 0;
    const paid = Number(o.amountPaid != null ? o.amountPaid : 0);
    let bal = tot - paid;
    if (!(bal > 1)) bal = 0;
    /** Heuristic unpaid lane */
    if (!wf.depositPaid(o)) bal = Math.max(bal, 0); // rely on KPI for authoritative outstanding

    if (bal <= 0) return;
    agingBuckets.open_sample.count += 1;
    agingBuckets.open_sample.outstandingUsd += bal;

    const updatedMs = o.updatedAt ? new Date(o.updatedAt).getTime() : null;
    if (updatedMs && now - updatedMs > 86400000 * 30) {
      agingBuckets.thirty_plus.count += 1;
      agingBuckets.thirty_plus.outstandingUsd += bal;
    }
    if (updatedMs && now - updatedMs > 86400000 * 60) {
      agingBuckets.sixty_plus.count += 1;
      agingBuckets.sixty_plus.outstandingUsd += bal;
    }
  });

  agingBuckets.open_sample.outstandingUsd = round2(agingBuckets.open_sample.outstandingUsd);
  agingBuckets.thirty_plus.outstandingUsd = round2(agingBuckets.thirty_plus.outstandingUsd);
  agingBuckets.sixty_plus.outstandingUsd = round2(agingBuckets.sixty_plus.outstandingUsd);

  outstandingApprox = agingBuckets.open_sample.outstandingUsd;

  let kpiSnap = null;
  try {
    const kpi = await kpiService.buildKpiSummary();
    kpiSnap = kpi.snapshot || null;
    if (!outstandingApprox && kpiSnap && kpiSnap.outstandingBalanceUsdApprox != null)
      outstandingApprox = round2(Number(kpiSnap.outstandingBalanceUsdApprox));
  } catch (_kp) {}

  /** @type {Record<string,{revenueUsd:number,completedCount:number}>} */
  const monthly = {};
  /** @type {Record<string,{revenueUsd:number,completedCount:number}>} */
  const quarterly = {};

  orders.forEach((o) => {
    if (!o) return;
    const paidAmt = Number(o.amountPaid || 0);
    if (!(paidAmt > 1)) return;
    const paidAt = o.finalPaidAt || o.completedAt;
    let d = paidAt instanceof Date ? paidAt : paidAt ? new Date(paidAt) : null;
    if (!(d instanceof Date && !isNaN(d.getTime()))) d = null;
    if (!d && o.updatedAt) d = new Date(o.updatedAt);
    if (!(d instanceof Date && !isNaN(d.getTime()))) return;

    const mKey = isoMonthAnchor(d);
    monthly[mKey] = monthly[mKey] || { revenueUsd: 0, completedCount: 0 };
    monthly[mKey].revenueUsd += paidAmt;
    monthly[mKey].completedCount += 1;

    const qBucket = `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    quarterly[qBucket] = quarterly[qBucket] || { revenueUsd: 0, completedCount: 0 };
    quarterly[qBucket].revenueUsd += paidAmt;
    quarterly[qBucket].completedCount += 1;
  });

  Object.keys(monthly).forEach((mk) => {
    monthly[mk].revenueUsd = round2(monthly[mk].revenueUsd);
  });
  Object.keys(quarterly).forEach((qk) => {
    quarterly[qk].revenueUsd = round2(quarterly[qk].revenueUsd);
  });

  /** sample profitability placeholders */
  /** @type {object[]} */
  const profitSamples = [];
  orders.slice(0, 120).forEach((o) => {
    const tot =
      Number(
        o.totalAmount != null ? o.totalAmount : o.total != null ? o.total : o.quotedAmount != null ? o.quotedAmount : 0
      ) || 0;
    const paid = Number(o.amountPaid || 0);
    if (!(tot > 25 && paid > 1)) return;
    if (profitSamples.length >= 8) return;
    profitSamples.push({
      orderIdShort: String(o.id || "").slice(0, 12),
      customer: String(o.customerName || "").slice(0, 80),
      paidUsd: paid,
      totalQuotedUsd: tot,
      marginHint:
        typeof o.actualCostUsd === "number" && typeof paid === "number"
          ? round2(paid - o.actualCostUsd)
          : "insufficient_cost_data",
      note:
        typeof o.actualCostUsd === "number"
          ? "Margin uses actualCostUsd column when populated."
          : "True margin needs landed cost ingestion — defer to bookkeeping.",
    });
  });

  return {
    reachable,
    generatedAt,
    arAgingBuckets: agingBuckets,
    outstandingBalanceUsdApprox: outstandingApprox || (kpiSnap && kpiSnap.outstandingBalanceUsdApprox) || "insufficient_data",
    revenueByMonth: monthly,
    revenueByQuarter: quarterly,
    profitabilitySamples: profitSamples,
    qbXeroPrep: {
      status: "placeholder_only",
      note: "No live accounting sync ships in Phase 7 — export CSVs via /api/reporting/advanced/export/accounting-rows for bookkeeping hand-off.",
      fieldsHint: ["dayKeyNY", "orderIdShort", "customer", "paidUsdApprox", "outstandingUsdHeuristic"],
    },
    taxVisibility: {
      status: "placeholder",
      note: "Tax filings stay with your CPA — Cheeky OS reads orders only.",
    },
    guardrailEcho:
      "Read-only accounting snapshots — invoices + payments anchored in Square remain authoritative if they diverge.",
  };
}

async function buildExportPreview() {
  const base = await summarizeAccounts();
  return {
    headline: "Export preview (nothing uploaded)",
    generatedAt: new Date().toISOString(),
    fields: ["isoDate", "orderIdShort", "customerName", "email", "quotedUsd", "paidUsdHeuristic"],
    approximateRowCountSafe: typeof base.arAgingBuckets?.open_sample?.count === "number" ? base.arAgingBuckets.open_sample.count : "unknown",
    note: base.qbXeroPrep.note,
  };
}

module.exports = {
  summarizeAccounts,
  buildExportPreview,
};
