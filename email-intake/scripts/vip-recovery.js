#!/usr/bin/env node
/**
 * Cheeky OS — VIP / whale dormant recovery (read-only ranked report).
 *
 * Uses src/lib/vipRecoveryScoring.ts. Does not contact customers or mutate data.
 *
 * Usage:
 *   node scripts/vip-recovery.js
 *   node scripts/vip-recovery.js --perTier 25
 *   node scripts/vip-recovery.js --orderScanLimit 8000   (biased sample — see banner)
 */

require("ts-node/register/transpile-only");

const path = require("path");
const { loadDotenvFromEmailIntake } = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const {
  scoreVipRecoveryCustomer,
  rankVipRecoveryCandidates,
  groupVipRecoveryByTier,
  VIP_MIN_DORMANCY_DAYS,
  VIP_TOO_RECENT_DAYS,
} = require(path.join(__dirname, "..", "src", "lib", "vipRecoveryScoring.ts"));

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const out = { orderScanLimit: null, perTier: 15 };
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

function printTier(title, list, cap, showFactors) {
  console.log(`--- ${title} (${list.length}) ---`);
  if (list.length === 0) {
    console.log("  (none)");
    console.log("");
    return;
  }
  list.slice(0, cap).forEach((c, i) => {
    const who = c.customerName || c.customerEmail || c.customerId.slice(0, 8);
    console.log(
      `  ${i + 1}. score=${c.vipRecoveryScore} | ${who} | ${c.customerEmail || "no email"}`
    );
    console.log(`     ${c.reason}`);
    console.log(`     → ${c.suggestedAction}`);
    if (c.excluded && c.exclusionReason) {
      console.log(`     [excluded: ${c.exclusionReason}]`);
    }
    if (showFactors && c.scoreFactors.length) {
      console.log(`     factors: ${c.scoreFactors.slice(0, 6).join(" | ")}`);
    }
    console.log("");
  });
  if (list.length > cap) {
    console.log(`  … +${list.length - cap} more not printed`);
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
    const rollup = {
      customerId,
      customerName: cust.name,
      customerEmail: cust.email,
      customerPhone: cust.phone,
      orders: byCustomer.get(customerId) || [],
    };
    candidates.push(scoreVipRecoveryCustomer(rollup));
  }

  const ranked = rankVipRecoveryCandidates(candidates);
  const grouped = groupVipRecoveryByTier(ranked);

  console.log("");
  console.log("=== CHEEKY OS — VIP / WHALE RECOVERY (read-only) ===");
  console.log("");
  if (orderScanLimit != null) {
    console.log(
      `WARNING: --orderScanLimit=${orderScanLimit} samples globally recent orders; lifetime paid / counts may be understated for some customers. Prefer full scan when possible.`
    );
    console.log("");
  }
  console.log(
    `Orders loaded: ${orders.length} (non-deleted, customer-linked). Unique customers: ${ids.length}.`
  );
  console.log(
    `Dormancy rules: out of scope if last activity < ${VIP_TOO_RECENT_DAYS}d; VIP candidates need ≥${VIP_MIN_DORMANCY_DAYS}d quiet (among other gates).`
  );
  console.log("No messages sent — ranking for operator triage only.");
  console.log("");

  printTier(
    "TIER 1 WHALES",
    grouped.TIER_1_WHALE,
    perTier,
    true
  );
  printTier(
    "TIER 2 HIGH VALUE",
    grouped.TIER_2_HIGH_VALUE,
    perTier,
    true
  );
  printTier(
    "TIER 3 WORTH REVIEW",
    grouped.TIER_3_WORTH_REVIEW,
    perTier,
    true
  );
  printTier(
    "REVIEW REQUIRED (weak contact / capped)",
    grouped.REVIEW_REQUIRED,
    perTier,
    true
  );
  printTier(
    "EXCLUDED (not on VIP track)",
    grouped.EXCLUDE,
    perTier,
    false
  );

  const active = ranked.filter((c) => !c.excluded).length;
  console.log("--- Summary ---");
  console.log(
    `  Scored in-tier (non-excluded): ${active} | excluded rows: ${ranked.length - active}`
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
