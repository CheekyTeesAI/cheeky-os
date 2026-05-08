#!/usr/bin/env node
/**
 * Cheeky OS — Reactivation drafts + call scripts (read-only, draft-only).
 *
 * Uses src/lib/reactivationDraftEngine.ts + same reactivation candidate collection
 * as follow-up-targets.js. Does not send mail or mutate state.
 *
 * Usage:
 *   node scripts/reactivation-drafts.js
 *   node scripts/reactivation-drafts.js --limit 40
 */

require("ts-node/register/transpile-only");

const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const {
  scoreFollowUpCandidate,
  rankFollowUpCandidates,
} = require(path.join(__dirname, "..", "src", "lib", "followUpScoring.ts"));

const {
  buildReactivationDraftsFromCandidates,
  groupReactivationDraftsByPriority,
} = require(path.join(__dirname, "..", "src", "lib", "reactivationDraftEngine.ts"));

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

const SECTION_TITLES = {
  HIGH_PRIORITY: "HIGH PRIORITY REACTIVATION DRAFTS",
  MEDIUM_PRIORITY: "MEDIUM PRIORITY REACTIVATION DRAFTS",
  LOW_PRIORITY: "LOW PRIORITY REACTIVATION DRAFTS",
  REVIEW_REQUIRED: "REVIEW REQUIRED — REACTIVATION DRAFTS",
};

function printDraftBlock(d, index) {
  const who = d.customerName || d.customerEmail || d.sourceRef.slice(0, 8);
  console.log(`  [${index}] ${d.priorityGroup} | ${who} | score=${d.reactivationScore} | review=${d.reviewRequired}`);
  console.log(`  Subject: ${d.subject}`);
  console.log("  Email:");
  d.emailBody.split("\n").forEach((line) => console.log(`    ${line}`));
  console.log("  Call script:");
  d.callScript.split("\n").forEach((line) => console.log(`    ${line}`));
  console.log(`  Why this draft/script: ${d.draftWhy}`);
  console.log(`  Internal: ${d.reason}`);
  console.log("");
}

async function main() {
  const { limit } = parseArgs(process.argv);

  const raw = await collectReactivationCandidates(limit);
  const ranked = rankFollowUpCandidates(raw);
  const drafts = buildReactivationDraftsFromCandidates(ranked);
  const grouped = groupReactivationDraftsByPriority(drafts);

  console.log("");
  console.log("=== CHEEKY OS — REACTIVATION DRAFTS + CALL SCRIPTS (draft-only) ===");
  console.log("");
  console.log(
    `Scanned reactivation pool (capped): up to ${limit} customers; ranked by follow-up score.`
  );
  console.log(
    "No messages sent — edit before any outreach. Templates are not legal/financial advice."
  );
  console.log("");

  const order = [
    "HIGH_PRIORITY",
    "MEDIUM_PRIORITY",
    "LOW_PRIORITY",
    "REVIEW_REQUIRED",
  ];

  for (const key of order) {
    const list = grouped[key];
    console.log(`--- ${SECTION_TITLES[key]} (${list.length}) ---`);
    if (list.length === 0) {
      console.log("  (none)");
      console.log("");
      continue;
    }
    const cap = key === "REVIEW_REQUIRED" ? 12 : 8;
    list.slice(0, cap).forEach((d, i) => printDraftBlock(d, i + 1));
    if (list.length > cap) {
      console.log(`  … +${list.length - cap} more (not printed)`);
      console.log("");
    }
  }

  console.log("--- Summary ---");
  console.log(
    `  HIGH: ${grouped.HIGH_PRIORITY.length} | MEDIUM: ${grouped.MEDIUM_PRIORITY.length} | LOW: ${grouped.LOW_PRIORITY.length} | REVIEW: ${grouped.REVIEW_REQUIRED.length}`
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
