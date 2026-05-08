#!/usr/bin/env node
/**
 * Cheeky OS — Revenue Command Center (read-only unified snapshot).
 *
 * Aligns follow-up candidate typing with follow-up-targets.js + send-queue file state.
 * Does not mutate queue, DB, or send mail.
 *
 * Usage:
 *   node scripts/revenue-command-center.js
 *   node scripts/revenue-command-center.js --limit 60 --recentHours 168
 */

require("ts-node/register/transpile-only");

const path = require("path");
const fs = require("fs");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const baseDir = path.join(__dirname, "..");

const {
  inferFollowUpTypeFromOrder,
  scoreFollowUpCandidate,
  rankFollowUpCandidates,
  groupByFollowUpType,
  groupByPriorityBand,
} = require(path.join(__dirname, "..", "src", "lib", "followUpScoring.ts"));

const {
  loadQueue,
  queueFilePath,
} = require(path.join(__dirname, "..", "src", "lib", "sendQueue.ts"));

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const EPS = 1e-6;
const REACTIVATION_QUIET_DAYS = 75;

function parseArgs(argv) {
  const out = { limit: 50, recentHours: 168 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key === "limit" || key === "recentHours") {
        if (next && !next.startsWith("--")) {
          const n = Number(next);
          if (Number.isFinite(n) && n > 0) {
            if (key === "limit") out.limit = Math.min(Math.floor(n), 200);
            else out.recentHours = Math.min(Math.floor(n), 24 * 30);
          }
          i++;
        }
      }
    }
  }
  return out;
}

function ageDays(date) {
  return (Date.now() - date.getTime()) / 86400000;
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

/** Read-only: same loader as send-queue tooling; no writes. */
function getQueueSnapshot() {
  const p = queueFilePath(baseDir);
  if (!fs.existsSync(p)) {
    return {
      ok: false,
      note: "No send-queue file yet (outputs/send-queue/queue.json)",
      entries: [],
      byState: {},
    };
  }
  const q = loadQueue(baseDir);
  const entries = Array.isArray(q.entries) ? q.entries : [];
  const byState = {};
  for (const e of entries) {
    const st = e.state || "?";
    byState[st] = (byState[st] || 0) + 1;
  }
  return { ok: true, entries, byState };
}

function recentSendCounts(entries, recentMs) {
  let sent = 0;
  let failed = 0;
  const cutoff = Date.now() - recentMs;
  for (const e of entries) {
    const t = e.sendAttemptedAt ? new Date(e.sendAttemptedAt).getTime() : 0;
    if (!t || t < cutoff) continue;
    if (e.state === "SENT") sent += 1;
    if (e.state === "FAILED") failed += 1;
  }
  return { sent, failed };
}

async function main() {
  const { limit, recentHours } = parseArgs(process.argv);
  const recentMs = recentHours * 3600000;

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

  const fromOrders = orders.map((o) => buildOrderCandidate(o));
  const reactivation = await collectReactivationCandidates(limit);
  const merged = rankFollowUpCandidates([...fromOrders, ...reactivation]);
  const byType = groupByFollowUpType(merged);
  const byBand = groupByPriorityBand(merged);

  const qStats = getQueueSnapshot();
  const queueEntries = qStats.entries || [];
  const recent = recentSendCounts(queueEntries, recentMs);

  const staleEst = byType.STALE_ESTIMATE?.length ?? 0;
  const unpaid = byType.UNPAID_INVOICE?.length ?? 0;
  const react = byType.CUSTOMER_REACTIVATION?.length ?? 0;
  const manual = byType.MANUAL_REVIEW?.length ?? 0;

  const draftReview = qStats.byState?.DRAFT_REVIEW ?? 0;
  const approved = qStats.byState?.APPROVED ?? 0;
  const queued = qStats.byState?.QUEUED ?? 0;
  const blockedQ = qStats.byState?.BLOCKED ?? 0;
  const sentTotal = qStats.byState?.SENT ?? 0;
  const failedTotal = qStats.byState?.FAILED ?? 0;

  console.log("");
  console.log("=== CHEEKY OS REVENUE COMMAND CENTER ===");
  console.log("");
  console.log(
    `Scope: up to ${limit} oldest open orders + reactivation scan; outreach queue from file; send attempts in last ${recentHours}h if timestamped.`
  );
  if (!qStats.ok) {
    console.log(`Send queue: ${qStats.note}`);
  } else if (queueEntries.length === 0) {
    console.log("Send queue: file exists; 0 entries.");
  }
  console.log("");

  console.log("1. Revenue opportunity snapshot (follow-up engine, this scan)");
  console.log(`   STALE_ESTIMATE:        ${staleEst}`);
  console.log(`   UNPAID_INVOICE:        ${unpaid}`);
  console.log(`   CUSTOMER_REACTIVATION: ${react}`);
  console.log(`   MANUAL_REVIEW:         ${manual}`);
  console.log("");

  console.log("2. Outreach execution snapshot (send-queue file, read-only)");
  if (qStats.ok) {
    console.log(`   DRAFT_REVIEW: ${draftReview}  |  APPROVED: ${approved}`);
    console.log(`   QUEUED (sendable): ${queued}  |  BLOCKED: ${blockedQ}`);
    console.log(`   SENT (total in file): ${sentTotal}  |  FAILED (total): ${failedTotal}`);
    console.log(
      `   Recent attempts (${recentHours}h): SENT-like timestamps=${recent.sent}, FAILED timestamps=${recent.failed}`
    );
    if (recent.sent + recent.failed === 0 && sentTotal + failedTotal > 0) {
      console.log(
        "   (No recent timestamp window matches — older sends or manual mark-sent without sendAttemptedAt.)"
      );
    }
  } else {
    console.log(`   ${qStats.note}`);
  }
  console.log("");

  console.log("3. Top priority buckets (operator-first)");
  console.log(
    `   STALE_ESTIMATE (${staleEst}) — aging quotes; close, revise, or replace before they go cold.`
  );
  console.log(
    `   UNPAID_INVOICE (${unpaid}) — cash in flight; invoice / balance resolution first when urgent.`
  );
  console.log(
    `   CUSTOMER_REACTIVATION (${react}) — dormant spenders; schedule after critical cash work.`
  );
  console.log(
    `   MANUAL_REVIEW (${manual}) — weak contact or triage lane; fix data before automation.`
  );
  console.log(
    `   Rank bands (same scan): HIGH ${byBand.HIGH.length} | MEDIUM ${byBand.MEDIUM.length} | REVIEW_REQUIRED ${byBand.REVIEW_REQUIRED.length}`
  );
  console.log("");

  console.log("4. Top records to review (up to 5 ranked + blocked queue samples)");
  merged.slice(0, 5).forEach((c, i) => {
    const who = c.customerName || c.customerEmail || c.sourceRef.slice(0, 8);
    const scored = scoreFollowUpCandidate(c);
    const ord =
      c.sourceType === "ORDER" && c.rawContext && c.rawContext.orderNumber != null
        ? `#${c.rawContext.orderNumber}`
        : "";
    const st =
      c.sourceType === "ORDER" && c.rawContext && c.rawContext.status
        ? String(c.rawContext.status)
        : "—";
    const ref = ord || `${c.sourceType} ${c.sourceRef.slice(0, 8)}…`;
    console.log(
      `   ${i + 1}. [${c.type}] ${who} | ${ref} | order/status: ${st} | score≈${scored.score} | ${c.reason}`
    );
  });
  if (merged.length === 0) {
    console.log("   (none in this scan)");
  }
  const blockedSamples = queueEntries.filter((e) => e.state === "BLOCKED").slice(0, 3);
  if (blockedSamples.length) {
    console.log("   Blocked send-queue (samples):");
    blockedSamples.forEach((e, i) => {
      const who = e.customerName || e.customerEmail || e.id.slice(0, 12);
      console.log(
        `   B${i + 1}. [BLOCKED] ${who} | ${e.type} | ${e.blockedReason || "no reason"}`
      );
    });
  }
  console.log("");

  console.log("5. Recommended actions for today");
  if (unpaid > staleEst && unpaid > 0) {
    console.log("   - Prioritize unpaid / partial balance follow-ups (cash in flight).");
  }
  if (staleEst > 0) {
    console.log("   - Work stale estimates — quotes going cold.");
  }
  if (blockedQ > 0) {
    console.log("   - Inspect BLOCKED queue rows before clearing.");
  }
  if (queued > 0) {
    console.log("   - Run guarded send when ready: node scripts/guarded-send.js list-sendable");
  }
  if (failedTotal > 0) {
    console.log("   - Review FAILED sends in queue file; retry only after fixing cause.");
  }
  if (react > 0) {
    console.log("   - Schedule reactivation touches when cash follow-ups are under control.");
  }
  if (manual > 0) {
    console.log("   - Clear MANUAL_REVIEW items — fix email/blocks so drafts can flow.");
  }
  if (draftReview > 0) {
    console.log("   - Approve or edit DRAFT_REVIEW rows before queuing guarded sends.");
  }
  console.log("   - Deeper money-path: node scripts/operator.js reconcile | overnight");
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
