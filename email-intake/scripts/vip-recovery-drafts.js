#!/usr/bin/env node
/**
 * Cheeky OS — VIP recovery email + owner-call drafts + advisory offer angles (draft-only).
 *
 * Uses vipRecoveryScoring + vipRecoveryDraftEngine. No sends, no auto-discounts.
 *
 * Usage:
 *   node scripts/vip-recovery-drafts.js
 *   node scripts/vip-recovery-drafts.js --perTier 8 --orderScanLimit 8000
 */

require("ts-node/register/transpile-only");

const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const {
  scoreVipRecoveryCustomer,
  rankVipRecoveryCandidates,
  VIP_MIN_DORMANCY_DAYS,
  VIP_TOO_RECENT_DAYS,
} = require(path.join(__dirname, "..", "src", "lib", "vipRecoveryScoring.ts"));

const {
  buildVipRecoveryDrafts,
  groupVipRecoveryDraftsByTier,
} = require(path.join(__dirname, "..", "src", "lib", "vipRecoveryDraftEngine.ts"));

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const out = { orderScanLimit: null, perTier: 8 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (
        (key === "orderScanLimit" || key === "perTier") &&
        next &&
        !next.startsWith("--")
      ) {
        const n = Number(next);
        if (Number.isFinite(n) && n > 0) {
          if (key === "orderScanLimit") out.orderScanLimit = Math.min(Math.floor(n), 50000);
          else out.perTier = Math.min(Math.floor(n), 200);
        }
        i++;
      }
    }
  }
  return out;
}

function printDraftSection(title, drafts, cap) {
  console.log(`--- ${title} (${drafts.length}) ---`);
  if (drafts.length === 0) {
    console.log("  (none)");
    console.log("");
    return;
  }
  drafts.slice(0, cap).forEach((d, i) => {
    const who = d.customerName || d.customerEmail || d.customerId.slice(0, 8);
    console.log(`  [${i + 1}] ${who} | score=${d.vipRecoveryScore} | review=${d.reviewRequired}`);
    console.log(`  Strategy: ${d.offerStrategyType}`);
    console.log(`  Subject: ${d.subject}`);
    console.log("  Email:");
    d.emailBody.split("\n").forEach((line) => console.log(`    ${line}`));
    console.log("  Owner call:");
    d.ownerCallScript.split("\n").forEach((line) => console.log(`    ${line}`));
    if (d.offerSuggestion) {
      console.log(`  Offer angle (advisory): ${d.offerSuggestion}`);
    }
    console.log(`  Why this draft: ${d.draftWhy}`);
    console.log("");
  });
  if (drafts.length > cap) {
    console.log(`  … +${drafts.length - cap} more not printed`);
    console.log("");
  }
}

async function main() {
  const { orderScanLimit, perTier } = parseArgs(process.argv);

  const q = {
    where: { deletedAt: null, customerId: { not: null } },
    select: {
      id: true,
      customerId: true,
      createdAt: true,
      updatedAt: true,
      amountPaid: true,
      totalAmount: true,
      total: true,
      quotedAmount: true,
      status: true,
      blockedReason: true,
    },
  };
  if (orderScanLimit != null) {
    q.take = orderScanLimit;
    q.orderBy = { updatedAt: "desc" };
  }

  const orders = await prisma.order.findMany(q);

  const byCustomer = new Map();
  for (const o of orders) {
    const id = o.customerId;
    if (!id) continue;
    if (!byCustomer.has(id)) byCustomer.set(id, []);
    byCustomer.get(id).push({
      id: o.id,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      amountPaid: o.amountPaid,
      totalAmount: o.totalAmount,
      total: o.total,
      quotedAmount: o.quotedAmount,
      status: String(o.status),
      blockedReason: o.blockedReason,
    });
  }

  const ids = [...byCustomer.keys()];
  const customers = await prisma.customer.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true, phone: true },
  });
  const custMap = new Map(customers.map((c) => [c.id, c]));

  const candidates = [];
  for (const customerId of ids) {
    const cust = custMap.get(customerId);
    if (!cust) continue;
    candidates.push(
      scoreVipRecoveryCustomer({
        customerId,
        customerName: cust.name,
        customerEmail: cust.email,
        customerPhone: cust.phone,
        orders: byCustomer.get(customerId) || [],
      })
    );
  }

  const ranked = rankVipRecoveryCandidates(candidates);
  const drafts = buildVipRecoveryDrafts(ranked);
  const grouped = groupVipRecoveryDraftsByTier(drafts);

  console.log("");
  console.log("=== CHEEKY OS — VIP RECOVERY DRAFTS + OFFER STRATEGY (draft-only) ===");
  console.log("");
  if (orderScanLimit != null) {
    console.log(
      `WARNING: --orderScanLimit=${orderScanLimit} biases aggregates — prefer full scan for production use.`
    );
    console.log("");
  }
  console.log(
    `Orders loaded: ${orders.length}. Drafts emitted for non-excluded VIP tiers only.`
  );
  console.log(
    `Gates align with VIP report: ≥${VIP_MIN_DORMANCY_DAYS}d quiet; <${VIP_TOO_RECENT_DAYS}d excluded.`
  );
  console.log("Offers are advisory — no auto-discounts; operator sets commercial terms.");
  console.log("");

  printDraftSection("TIER 1 WHALE RECOVERY DRAFTS", grouped.TIER_1_WHALE, perTier);
  printDraftSection("TIER 2 HIGH VALUE RECOVERY DRAFTS", grouped.TIER_2_HIGH_VALUE, perTier);
  printDraftSection("TIER 3 WORTH REVIEW", grouped.TIER_3_WORTH_REVIEW, perTier);
  printDraftSection("REVIEW REQUIRED", grouped.REVIEW_REQUIRED, perTier);

  console.log("--- Summary ---");
  console.log(`  Drafts printed (cap ${perTier}/section): ${drafts.length} total built`);
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
