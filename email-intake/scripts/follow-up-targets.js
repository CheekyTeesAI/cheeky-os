#!/usr/bin/env node
/**
 * Cheeky OS — Sales Follow-Up Engine 2.0 (read-only ranked targets + assisted drafts).
 *
 * Uses src/lib/followUpScoring.ts for typing + scoring and
 * src/lib/outreachDraftEngine.ts for review-only draft copy. No messages sent.
 *
 * Usage:
 *   node scripts/follow-up-targets.js
 *   node scripts/follow-up-targets.js --limit 40
 */

require("ts-node/register/transpile-only");

const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const {
  inferFollowUpTypeFromOrder,
  scoreFollowUpCandidate,
  rankFollowUpCandidates,
  groupByPriorityBand,
  groupByFollowUpType,
} = require(path.join(__dirname, "..", "src", "lib", "followUpScoring.ts"));

const { buildOutreachDraft } = require(path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "outreachDraftEngine.ts"
));

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const EPS = 1e-6;
const REACTIVATION_QUIET_DAYS = 75;

function parseArgs(argv) {
  const out = { limit: 50 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key === "limit" && next && !next.startsWith("--")) {
        const n = Number(next);
        if (Number.isFinite(n) && n > 0) {
          out.limit = Math.min(Math.floor(n), 200);
        }
        i++;
      }
    }
  }
  return out;
}

function ageDays(date) {
  return (Date.now() - date.getTime()) / 86400000;
}

function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return "?";
  return `$${Number(n).toFixed(0)}`;
}

function buildOrderCandidate(order) {
  const email = order.email || order.customer?.email || null;
  const name = order.customerName || order.customer?.name || null;
  const phone = order.phone || order.customer?.phone || null;
  const ad = ageDays(order.updatedAt);

  const type = inferFollowUpTypeFromOrder({
    status: String(order.status),
    amountPaid: Number(order.amountPaid) || 0,
    totalAmount: Number(order.totalAmount) || 0,
    quotedAmount: order.quotedAmount,
    squareInvoiceId: order.squareInvoiceId,
    squareInvoiceNumber: order.squareInvoiceNumber,
    ageDays: ad,
    blockedReason: order.blockedReason,
    manualOverride: order.manualOverride === true,
    email,
  });

  const total =
    (Number(order.totalAmount) || 0) > EPS
      ? Number(order.totalAmount)
      : order.quotedAmount != null && order.quotedAmount > 0
        ? order.quotedAmount
        : 0;

  const reviewRequired =
    type === "MANUAL_REVIEW" ||
    !email ||
    !String(email).includes("@");

  let reason = "";
  let action = "";
  if (type === "UNPAID_INVOICE") {
    reason = "Balance due with Square invoice linkage";
    action = "Call / email payment link or resolve invoice state";
  } else if (type === "STALE_ESTIMATE") {
    reason = "Quote / estimate lane aging without full close";
    action = "Follow up on estimate acceptance or revise quote";
  } else {
    reason = "Needs operator triage (blocked, weak contact, or unclear lane)";
    action = "Review order details and next step manually";
  }

  const c = {
    type,
    priorityScore: 0,
    customerName: name,
    customerEmail: email,
    customerPhone: phone,
    sourceRef: order.id,
    sourceType: "ORDER",
    ageDays: Math.round(ad * 10) / 10,
    estimatedValue: total > 0 ? total : null,
    lastActivityAt: order.updatedAt.toISOString(),
    reason,
    suggestedAction: action,
    reviewRequired,
    rawContext: {
      orderNumber: order.orderNumber,
      status: order.status,
      amountPaid: order.amountPaid,
    },
  };
  c.priorityScore = scoreFollowUpCandidate(c).score;
  return c;
}

async function collectReactivationCandidates(limit) {
  const customers = await prisma.customer.findMany({
    take: Math.min(limit, 80),
    include: {
      orders: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          updatedAt: true,
          amountPaid: true,
          totalAmount: true,
          status: true,
        },
      },
    },
  });

  const out = [];
  for (const cust of customers) {
    if (!cust.orders.length) continue;
    const last = cust.orders[0];
    const quiet = ageDays(last.updatedAt);
    const everPaid = cust.orders.some((o) => (Number(o.amountPaid) || 0) > EPS);
    if (quiet < REACTIVATION_QUIET_DAYS || !everPaid) continue;
    if (!cust.email || !String(cust.email).includes("@")) continue;

    const c = {
      type: "CUSTOMER_REACTIVATION",
      priorityScore: 0,
      customerName: cust.name,
      customerEmail: cust.email,
      customerPhone: cust.phone,
      sourceRef: cust.id,
      sourceType: "CUSTOMER",
      ageDays: Math.round(quiet * 10) / 10,
      estimatedValue: null,
      lastActivityAt: last.updatedAt.toISOString(),
      reason: `No order touch for ~${Math.floor(quiet)}d; prior spend history on file`,
      suggestedAction: "Reactivation outreach — confirm interest and offer new quote",
      reviewRequired: false,
      rawContext: { lastOrderId: last.id, orderCount: cust.orders.length },
    };
    c.priorityScore = scoreFollowUpCandidate(c).score;
    out.push(c);
  }
  return out;
}

async function main() {
  const { limit } = parseArgs(process.argv);

  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      status: {
        notIn: ["CANCELLED", "COMPLETED", "PAID_IN_FULL"],
      },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customerName: true,
      email: true,
      phone: true,
      quotedAmount: true,
      totalAmount: true,
      amountPaid: true,
      squareInvoiceId: true,
      squareInvoiceNumber: true,
      updatedAt: true,
      blockedReason: true,
      manualOverride: true,
      customer: { select: { name: true, email: true, phone: true } },
    },
  });

  const fromOrders = [];
  for (const o of orders) {
    fromOrders.push(buildOrderCandidate(o));
  }

  const reactivation = await collectReactivationCandidates(limit);

  const merged = rankFollowUpCandidates([...fromOrders, ...reactivation]);
  const byBand = groupByPriorityBand(merged);
  const byType = groupByFollowUpType(merged);

  console.log("");
  console.log("=== CHEEKY OS — SALES FOLLOW-UP TARGETS (read-only) ===");
  console.log("");
  console.log(
    `Scanned: up to ${limit} oldest-updated open orders + reactivation scan (capped).`
  );
  console.log(
    "No messages sent — use your outreach workflow / routes to act."
  );
  console.log("");

  function printList(title, list) {
    console.log(`--- ${title} (${list.length}) ---`);
    if (list.length === 0) {
      console.log("  (none)");
      console.log("");
      return;
    }
    list.slice(0, 25).forEach((c, i) => {
      const score = scoreFollowUpCandidate(c).score;
      const who =
        c.customerName || c.customerEmail || c.sourceRef.slice(0, 8);
      console.log(
        `  ${i + 1}. [${c.type}] score=${score} ${who} | ${fmtMoney(
          c.estimatedValue
        )} | age≈${c.ageDays ?? "?"}d`
      );
      console.log(`     ${c.reason}`);
      console.log(`     → ${c.suggestedAction}`);
      if (c.sourceType === "ORDER") {
        console.log(
          `     node scripts/order-state-audit.js --orderId ${c.sourceRef}`
        );
      }
    });
    if (list.length > 25) {
      console.log(`  … +${list.length - 25} more`);
    }
    console.log("");
  }

  printList("HIGH PRIORITY", byBand.HIGH);
  printList("MEDIUM PRIORITY", byBand.MEDIUM);
  printList("REVIEW REQUIRED", byBand.REVIEW_REQUIRED);

  console.log("=== ASSISTED OUTREACH DRAFTS (draft-only — do not auto-send) ===");
  console.log("");
  console.log(
    "Templates are customer-safe starters. Edit before any send. No mail/API calls from this script."
  );
  console.log("");

  function printDraftBand(title, list) {
    console.log(`--- ${title} ---`);
    if (list.length === 0) {
      console.log("  (none)");
      console.log("");
      return;
    }
    list.slice(0, 8).forEach((c, i) => {
      const d = buildOutreachDraft(c);
      console.log(`  [${i + 1}] ${d.followUpType} → ${d.customerEmail || "no email"} | review=${d.reviewRequired}`);
      console.log(`  Subject: ${d.subject}`);
      console.log("  Body:");
      d.body.split("\n").forEach((line) => console.log(`    ${line}`));
      console.log(`  Why this draft: ${d.draftWhy}`);
      console.log(`  Internal: ${d.reason}`);
      console.log("");
    });
    if (list.length > 8) {
      console.log(`  … +${list.length - 8} more targets (drafts not printed)`);
      console.log("");
    }
  }

  printDraftBand("HIGH PRIORITY DRAFTS", byBand.HIGH);
  printDraftBand("MEDIUM PRIORITY DRAFTS", byBand.MEDIUM);
  printDraftBand("REVIEW REQUIRED DRAFTS", byBand.REVIEW_REQUIRED);

  console.log("--- By follow-up type ---");
  for (const t of [
    "UNPAID_INVOICE",
    "STALE_ESTIMATE",
    "CUSTOMER_REACTIVATION",
    "MANUAL_REVIEW",
  ]) {
    console.log(`  ${t}: ${byType[t].length}`);
  }
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
