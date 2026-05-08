#!/usr/bin/env node
/**
 * Cheeky OS — money-path review export (read-only).
 *
 * Bounded scan + same heuristic signals as order-payment-reconcile.js.
 * Writes JSON and CSV under email-intake/outputs/ (folder created if missing).
 *
 * Usage:
 *   node scripts/money-path-export.js
 *   node scripts/money-path-export.js --limit 25 --recentDays 7
 *   node scripts/money-path-export.js --format json
 *   node scripts/money-path-export.js --format csv
 */

const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const EPS = 1e-6;

const PRE_PAYMENT = new Set([
  "INTAKE",
  "QUOTE_READY",
  "APPROVED",
  "INVOICE_DRAFTED",
]);

const PAID_TIER = new Set(["PAID", "DEPOSIT_PAID", "PAID_IN_FULL"]);

const DEFAULT_ACTION =
  "Run scripts/order-state-audit.js for this order id before manual repair; if many rows, verify webhook delivery.";

function parseArgs(argv) {
  const out = { limit: 50, recentDays: 14, format: "both" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        if (key === "limit" || key === "recentDays") {
          const n = Number(next);
          if (Number.isFinite(n) && n > 0) {
            out[key] = Math.min(Math.floor(n), key === "limit" ? 500 : 365);
          }
        } else if (key === "format") {
          const f = String(next).toLowerCase();
          if (f === "json" || f === "csv" || f === "both") {
            out.format = f;
          }
        }
        i++;
      }
    }
  }
  return out;
}

function hasAnySquareRef(o) {
  return !!(o.squareInvoiceId || o.squareOrderId || o.squarePaymentId);
}

function depositThreshold(o) {
  if (o.depositRequired != null && Number.isFinite(o.depositRequired)) {
    return o.depositRequired;
  }
  const q = o.quotedAmount;
  if (q != null && q > 0) return q * 0.5;
  if (o.depositAmount != null && o.depositAmount > 0) return o.depositAmount;
  return 0;
}

function effectiveFullAmount(o) {
  if (o.quotedAmount != null && o.quotedAmount > 0) return o.quotedAmount;
  if (o.totalAmount != null && o.totalAmount > 0) return o.totalAmount;
  return null;
}

/** Mirrors order-payment-reconcile.js classify(). */
function classify(o) {
  if (o.status === "CANCELLED") return [];

  const reasons = [];
  const st = String(o.status || "");
  const paid = Number(o.amountPaid) || 0;
  const total = Number(o.totalAmount) || 0;
  const depStore = Number(o.depositAmount) || 0;

  if (depStore > total + EPS && total >= 0) {
    reasons.push({
      key: "deposit_gt_total",
      detail:
        "likely mismatch: depositAmount exceeds totalAmount (numeric inconsistency)",
    });
  }

  if (paid > total + EPS) {
    reasons.push({
      key: "amount_paid_gt_total",
      detail:
        "likely mismatch: amountPaid greater than totalAmount (needs review)",
    });
  }

  const fullAmt = effectiveFullAmount(o);
  if (
    fullAmt != null &&
    fullAmt > 0 &&
    paid + EPS >= fullAmt &&
    st !== "PAID_IN_FULL"
  ) {
    reasons.push({
      key: "full_amount_vs_status",
      detail:
        "amountPaid meets/exceeds quoted or total ceiling but status is not PAID_IN_FULL (stale-looking)",
    });
  }

  const depNeed = depositThreshold(o);
  if (
    depNeed > 0 &&
    paid + EPS >= depNeed &&
    !o.depositPaidAt &&
    !["DEPOSIT_PAID", "PAID_IN_FULL"].includes(st)
  ) {
    reasons.push({
      key: "deposit_threshold_vs_ledger",
      detail:
        "deposit threshold likely met (amountPaid vs deposit rule) but status/depositPaidAt not aligned (needs review)",
    });
  }

  if (paid > EPS && PRE_PAYMENT.has(st)) {
    reasons.push({
      key: "money_with_pre_payment_status",
      detail:
        "amountPaid > 0 while status is still pre-payment workflow (likely stale)",
    });
  }

  if (o.squarePaymentId && PRE_PAYMENT.has(st)) {
    reasons.push({
      key: "payment_ref_pre_payment_status",
      detail:
        "squarePaymentId present but status still pre-payment (stale-looking)",
    });
  }

  if (o.squarePaymentId && !o.squareInvoiceId && !o.squareInvoiceNumber) {
    reasons.push({
      key: "payment_ref_without_invoice_ref",
      detail:
        "payment ref without invoice id/number on order (may be valid for some flows — verify)",
    });
  }

  if (PAID_TIER.has(st) && !hasAnySquareRef(o)) {
    reasons.push({
      key: "paid_tier_status_no_square_refs",
      detail:
        "status suggests paid/deposit tier but no Square invoice/order/payment refs (needs review)",
    });
  }

  return reasons;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function iso(d) {
  if (!d) return "";
  try {
    return d instanceof Date ? d.toISOString() : String(d);
  } catch {
    return "";
  }
}

async function main() {
  const { limit, recentDays, format } = parseArgs(process.argv);
  const since = new Date(Date.now() - recentDays * 86400000);

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      updatedAt: { gte: since },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      depositAmount: true,
      quotedAmount: true,
      depositRequired: true,
      amountPaid: true,
      depositPaidAt: true,
      squareInvoiceId: true,
      squareInvoiceNumber: true,
      squareOrderId: true,
      squarePaymentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const flagged = [];
  const bucketTotals = {};

  for (const o of orders) {
    const reasons = classify(o);
    if (reasons.length) {
      flagged.push({ order: o, reasons });
      for (const r of reasons) {
        bucketTotals[r.key] = (bucketTotals[r.key] || 0) + 1;
      }
    }
  }

  const outDir = path.join(__dirname, "..", "outputs");
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `money-path-review-${stamp}`;

  const rows = flagged.map(({ order: o, reasons }) => {
    const codes = reasons.map((r) => r.key).join("|");
    const detail = reasons.map((r) => `${r.key}: ${r.detail}`).join(" || ");
    return {
      orderId: o.id,
      orderLabel: o.orderNumber || o.id,
      status: o.status,
      totalAmount: o.totalAmount,
      depositAmount: o.depositAmount,
      quotedAmount: o.quotedAmount,
      amountPaid: o.amountPaid,
      squareInvoiceIdPresent: !!o.squareInvoiceId,
      squareInvoiceNumberPresent: !!o.squareInvoiceNumber,
      squareOrderIdPresent: !!o.squareOrderId,
      squarePaymentIdPresent: !!o.squarePaymentId,
      createdAt: iso(o.createdAt),
      updatedAt: iso(o.updatedAt),
      reviewReasonCodes: codes,
      reviewReasonDetail: detail,
      suggestedNextAction: DEFAULT_ACTION,
      signals: reasons.map((r) => ({ key: r.key, detail: r.detail })),
    };
  });

  const written = [];

  if (format === "json" || format === "both") {
    const jsonPath = path.join(outDir, `${base}.json`);
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          scan: { limit, recentDays, ordersScanned: orders.length },
          unavailableSignalsNote:
            "DB-only export; live Square totals not included. Heuristics are not proof.",
          records: rows,
        },
        null,
        2
      ),
      "utf8"
    );
    written.push(jsonPath);
  }

  if (format === "csv" || format === "both") {
    const csvPath = path.join(outDir, `${base}.csv`);
    const headers = [
      "orderId",
      "orderLabel",
      "status",
      "totalAmount",
      "depositAmount",
      "quotedAmount",
      "amountPaid",
      "squareInvoiceIdPresent",
      "squareInvoiceNumberPresent",
      "squareOrderIdPresent",
      "squarePaymentIdPresent",
      "createdAt",
      "updatedAt",
      "reviewReasonCodes",
      "reviewReasonDetail",
      "suggestedNextAction",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.orderId,
          r.orderLabel,
          r.status,
          r.totalAmount,
          r.depositAmount,
          r.quotedAmount ?? "",
          r.amountPaid,
          r.squareInvoiceIdPresent,
          r.squareInvoiceNumberPresent,
          r.squareOrderIdPresent,
          r.squarePaymentIdPresent,
          r.createdAt,
          r.updatedAt,
          r.reviewReasonCodes,
          r.reviewReasonDetail,
          r.suggestedNextAction,
        ]
          .map(csvEscape)
          .join(",")
      );
    }
    fs.writeFileSync(csvPath, lines.join("\n"), "utf8");
    written.push(csvPath);
  }

  const topBuckets = Object.entries(bucketTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  console.log("");
  console.log("=== CHEEKY OS MONEY PATH EXPORT ===");
  console.log("");
  console.log("Output file(s):");
  for (const p of written) {
    console.log(`  ${p}`);
  }
  console.log("");
  console.log(`Total orders scanned: ${orders.length}`);
  console.log(`Total flagged records exported: ${rows.length}`);
  console.log(`Top review signal counts (may overlap per order): ${topBuckets || "(none)"}`);
  console.log(
    `Scan bounds: updatedAt within last ${recentDays} days, newest first, max ${limit} rows`
  );
  console.log(
    "Note: signals are heuristics (likely_stale / needs_manual_audit style); not legal or accounting truth."
  );
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
