#!/usr/bin/env node
/**
 * Cheeky OS — daily operator snapshot (read-only).
 *
 * Combines a lightweight /health probe with DB counts aligned to
 * money-path-report + order-payment-reconcile heuristics (bounded reconcile scan).
 *
 * Usage:
 *   node scripts/daily-status.js
 *   node scripts/daily-status.js --limit 50 --recentDays 14
 *   node scripts/daily-status.js --skip-health
 */

const path = require("path");
const http = require("http");
const https = require("https");
const { URL } = require("url");

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

const PRE_PAYMENT_ARR = [...PRE_PAYMENT];

const PAID_TIER = new Set(["PAID", "DEPOSIT_PAID", "PAID_IN_FULL"]);

function parseArgs(argv) {
  const out = { limit: 50, recentDays: 14, skipHealth: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--skip-health") {
      out.skipHealth = true;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        if (key === "limit" || key === "recentDays") {
          const n = Number(next);
          if (Number.isFinite(n) && n > 0) {
            out[key] = Math.min(Math.floor(n), key === "limit" ? 500 : 365);
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

/** Same rules as order-payment-reconcile.js (keep in sync manually). */
function classify(o) {
  if (o.status === "CANCELLED") return [];

  const reasons = [];
  const st = String(o.status || "");
  const paid = Number(o.amountPaid) || 0;
  const total = Number(o.totalAmount) || 0;
  const depStore = Number(o.depositAmount) || 0;

  if (depStore > total + EPS && total >= 0) {
    reasons.push({ key: "deposit_gt_total" });
  }
  if (paid > total + EPS) {
    reasons.push({ key: "amount_paid_gt_total" });
  }
  const fullAmt = effectiveFullAmount(o);
  if (
    fullAmt != null &&
    fullAmt > 0 &&
    paid + EPS >= fullAmt &&
    st !== "PAID_IN_FULL"
  ) {
    reasons.push({ key: "full_amount_vs_status" });
  }
  const depNeed = depositThreshold(o);
  if (
    depNeed > 0 &&
    paid + EPS >= depNeed &&
    !o.depositPaidAt &&
    !["DEPOSIT_PAID", "PAID_IN_FULL"].includes(st)
  ) {
    reasons.push({ key: "deposit_threshold_vs_ledger" });
  }
  if (paid > EPS && PRE_PAYMENT.has(st)) {
    reasons.push({ key: "money_with_pre_payment_status" });
  }
  if (o.squarePaymentId && PRE_PAYMENT.has(st)) {
    reasons.push({ key: "payment_ref_pre_payment_status" });
  }
  if (o.squarePaymentId && !o.squareInvoiceId && !o.squareInvoiceNumber) {
    reasons.push({ key: "payment_ref_without_invoice_ref" });
  }
  if (PAID_TIER.has(st) && !hasAnySquareRef(o)) {
    reasons.push({ key: "paid_tier_status_no_square_refs" });
  }
  return reasons;
}

function probeHealth() {
  return new Promise((resolve) => {
    const base = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(
      /\/+$/,
      ""
    );
    let u;
    try {
      u = new URL("/health", base);
    } catch {
      resolve({ ok: false, detail: "invalid SMOKE_BASE_URL" });
      return;
    }
    const lib = u.protocol === "https:" ? https : http;
    const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    const req = lib.request(
      {
        hostname: u.hostname,
        port,
        path: u.pathname || "/health",
        method: "GET",
        timeout: 4000,
      },
      (res) => {
        res.resume();
        resolve({
          ok: res.statusCode === 200,
          detail: `HTTP ${res.statusCode}`,
        });
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, detail: "timeout (server not responding?)" });
    });
    req.on("error", (e) => {
      resolve({
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    });
    req.end();
  });
}

async function main() {
  const { limit, recentDays, skipHealth } = parseArgs(process.argv);
  const since = new Date(Date.now() - recentDays * 86400000);

  const base = { deletedAt: null };

  const [health, totalOrders, countMissingRefs, countStalePaid] =
    await Promise.all([
      skipHealth
        ? Promise.resolve({ skipped: true })
        : probeHealth(),
      prisma.order.count({ where: base }),
      prisma.order.count({
        where: {
          ...base,
          status: { not: "CANCELLED" },
          squareInvoiceId: null,
          squareOrderId: null,
          squarePaymentId: null,
        },
      }),
      prisma.order.count({
        where: {
          ...base,
          amountPaid: { gt: EPS },
          status: { in: PRE_PAYMENT_ARR },
          OR: [
            { squareInvoiceId: { not: null } },
            { squareOrderId: { not: null } },
            { squarePaymentId: { not: null } },
          ],
        },
      }),
    ]);

  const orders = await prisma.order.findMany({
    where: {
      ...base,
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
      updatedAt: true,
    },
  });

  const bucketTotals = {};
  let flagged = 0;
  const examples = [];

  for (const o of orders) {
    const reasons = classify(o);
    if (reasons.length) {
      flagged += 1;
      for (const r of reasons) {
        bucketTotals[r.key] = (bucketTotals[r.key] || 0) + 1;
      }
      if (examples.length < 3) {
        examples.push({
          label: o.orderNumber || o.id,
          id: o.id,
          keys: reasons.map((r) => r.key).join("|"),
        });
      }
    }
  }

  const topBuckets = Object.entries(bucketTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");

  console.log("");
  console.log("=== CHEEKY OS DAILY STATUS ===");
  console.log("");

  console.log("1. System Health");
  if (health && health.skipped) {
    console.log("- GET /health: skipped (--skip-health)");
  } else if (health && "ok" in health) {
    console.log(
      `- GET /health (${process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000"}): ${
        health.ok ? "OK" : "not OK"
      } (${health.detail})`
    );
  }
  console.log(
    "- Full smoke suite: run `node scripts/operator.js smoke` when the API is up (broader checks)."
  );
  console.log("");

  console.log("2. Money Path Snapshot (DB-only; global counts + bounded window for reconcile)");
  console.log(`- active orders (non-deleted): ${totalOrders}`);
  console.log(
    `- missing Square refs (no invoice/order/payment id, not cancelled): ${countMissingRefs}`
  );
  console.log(
    `- stale-looking paid vs pre-pay status (amountPaid>0, pre-pay status, has a ref): ${countStalePaid}`
  );
  console.log(
    `- reconcile scan: last ${recentDays}d by updatedAt, newest first, max ${limit} rows`
  );
  console.log(
    "- unavailable: live Square totals / Dashboard not queried here; full buckets: `node scripts/money-path-report.js`"
  );
  console.log("");

  console.log("3. Reconciliation Snapshot (same rules as order-payment-reconcile.js on scan slice)");
  console.log(`- orders in scan with ≥1 mismatch signal: ${flagged}`);
  console.log(`- top signal keys (may overlap per order): ${topBuckets || "(none)"}`);
  if (examples.length) {
    console.log("- examples (sample):");
    for (const ex of examples) {
      console.log(`  - ${ex.label}  id=${ex.id}  signals=${ex.keys}`);
    }
  }
  console.log("");

  console.log("4. Recommended Actions");
  if (!skipHealth && health && "ok" in health && !health.ok) {
    console.log("- Health probe failed: confirm the API process and SMOKE_BASE_URL, then run smoke.");
  }
  if (countMissingRefs > 0 || countStalePaid > 0 || flagged > 0) {
    console.log(
      "- Review money path: `node scripts/operator.js report` or `node scripts/operator.js reconcile`."
    );
    console.log(
      "- Drill into a row: `node scripts/operator.js audit --orderId <uuid>` (or orderNumber / Square ids)."
    );
    console.log(
      "- Export for offline review: `node scripts/operator.js export --recentDays 7`."
    );
  } else {
    console.log("- No strong signals on this slice; spot-check `money:report` if workload is high.");
  }
  console.log(
    "- Manual repair only after audit confirms intent; many stale rows → verify webhooks / ProcessedWebhookEvent."
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
