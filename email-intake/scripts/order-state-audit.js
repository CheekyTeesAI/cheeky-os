#!/usr/bin/env node
/**
 * Cheeky OS — operator order / payment state audit (read-only by default).
 *
 * Requires DATABASE_URL (via .env in email-intake root or env).
 *
 * Usage:
 *   node scripts/order-state-audit.js --orderId <uuid>
 *   node scripts/order-state-audit.js --orderNumber <string>
 *   node scripts/order-state-audit.js --squareOrderId <id>
 *   node scripts/order-state-audit.js --squarePaymentId <id>
 *   node scripts/order-state-audit.js --squareInvoiceId <id>
 *   node scripts/order-state-audit.js --squareInvoiceNumber <num>
 *   node scripts/order-state-audit.js --eventId <square_event_id>
 *
 * Replay:
 *   --replay  — not supported: service replay needs the original webhook JSON and
 *               idempotency keys; this tool does not mutate or simulate payloads.
 */

const {
  loadDotenvFromEmailIntake,
  parsePairArgs,
  collectLookups,
  formatIsoDate,
} = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const LOOKUP_KEYS = [
  "orderId",
  "orderNumber",
  "squareOrderId",
  "squarePaymentId",
  "squareInvoiceId",
  "squareInvoiceNumber",
  "eventId",
];

const EPS = 1e-6;

function mismatchSignals(order, processedEvent) {
  const signals = [];
  const st = String(order.status || "").toUpperCase();
  const quoted =
    order.quotedAmount != null && Number.isFinite(order.quotedAmount)
      ? order.quotedAmount
      : null;
  const paid = Number(order.amountPaid) || 0;
  const depReq =
    order.depositRequired != null && Number.isFinite(order.depositRequired)
      ? order.depositRequired
      : quoted != null && quoted > 0
        ? quoted * 0.5
        : 0;

  if (paid > EPS && ["INTAKE", "QUOTE_READY", "APPROVED", "INVOICE_DRAFTED"].includes(st)) {
    signals.push("amountPaid > 0 but status still pre-payment workflow — verify webhook or manual transition");
  }
  if (quoted != null && quoted > 0 && paid + EPS >= quoted && st !== "PAID_IN_FULL" && st !== "CANCELLED") {
    signals.push("amountPaid meets or exceeds quotedAmount but status is not PAID_IN_FULL");
  }
  if (depReq > 0 && paid + EPS >= depReq && !order.depositPaidAt && !["DEPOSIT_PAID", "PAID_IN_FULL", "CANCELLED"].includes(st)) {
    signals.push("deposit threshold appears met but depositPaidAt is unset and status not deposit/paid-in-full");
  }
  if (order.squareLastEventId && processedEvent === null) {
    signals.push("order.squareLastEventId set but no matching ProcessedWebhookEvent row (data drift or partial migration)");
  }
  if (!order.squareInvoiceId && !order.squareOrderId && !order.squarePaymentId) {
    signals.push("no Square invoice/order/payment ids on order — webhooks may not match this row");
  }

  return signals;
}

function suggestedAction(signals, order) {
  if (signals.length === 0) {
    return "No automatic mismatch flags. If incident persists, compare Square Dashboard payment/invoice vs. fields above.";
  }
  if (signals.some((s) => s.includes("webhook"))) {
    return "Check Square webhook delivery logs and order linkage (squareInvoiceId / squareOrderId / squareInvoiceNumber). Re-send or fix linkage before considering manual status updates.";
  }
  return "Review amountPaid, quotedAmount, deposit fields, and status transitions in squareWebhookService rules; confirm Square side state.";
}

const orderInclude = {
  _count: { select: { tasks: true, lineItems: true } },
  tasks: {
    take: 20,
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, status: true, dueDate: true, updatedAt: true },
  },
};

async function findOrderByLookup(key, value) {
  const base = { deletedAt: null };
  switch (key) {
    case "orderId":
      return prisma.order.findFirst({
        where: { id: value, ...base },
        include: orderInclude,
      });
    case "orderNumber":
      return prisma.order.findFirst({
        where: { orderNumber: value, ...base },
        include: orderInclude,
      });
    case "squareOrderId":
      return prisma.order.findFirst({
        where: { squareOrderId: value, ...base },
        include: orderInclude,
      });
    case "squarePaymentId":
      return prisma.order.findFirst({
        where: { squarePaymentId: value, ...base },
        include: orderInclude,
      });
    case "squareInvoiceId":
      return prisma.order.findFirst({
        where: { squareInvoiceId: value, ...base },
        include: orderInclude,
      });
    case "squareInvoiceNumber":
      return prisma.order.findFirst({
        where: { squareInvoiceNumber: value, ...base },
        include: orderInclude,
      });
    default:
      return null;
  }
}

async function main() {
  const args = parsePairArgs(process.argv, {
    booleanFlags: new Set(["replay"]),
  });
  const lookups = collectLookups(args, LOOKUP_KEYS);

  if (lookups.length !== 1) {
    console.error(
      "Usage: provide exactly one of:\n  " +
        LOOKUP_KEYS.map((k) => `--${k} <value>`).join("\n  ")
    );
    console.error("\nOptional: --replay (see script header — replay is blocked.)");
    process.exitCode = 1;
    return;
  }

  if (args.replay) {
    console.error("");
    console.error("*** WARNING: replay was requested ***");
    console.error(
      "Safe replay requires the original Square webhook JSON and correct idempotency (event_id)."
    );
    console.error("REPLAY BLOCKED: safe replay path not available");
    console.error("");
    process.exitCode = 2;
    return;
  }

  const { key, value } = lookups[0];

  let order = null;
  let lookupNote = "";

  if (key === "eventId") {
    const eventRow = await prisma.processedWebhookEvent.findUnique({
      where: { id: value },
    });
    lookupNote = eventRow
      ? `ProcessedWebhookEvent: id=${value} eventType=${eventRow.eventType} processedAt=${formatIsoDate(eventRow.processedAt)}`
      : `No ProcessedWebhookEvent row for event id=${value}`;
    order = await prisma.order.findFirst({
      where: { squareLastEventId: value, deletedAt: null },
      include: orderInclude,
    });
  } else {
    order = await findOrderByLookup(key, value);
  }

  if (!order) {
    console.log("");
    console.log("=== CHEEKY OS ORDER STATE AUDIT ===");
    console.log("");
    console.log("Lookup:", `${key}=${value}`);
    if (lookupNote) console.log("Event:", lookupNote);
    console.log("");
    console.log("Resolved Order: NOT FOUND");
    console.log("");
    process.exitCode = 1;
    return;
  }

  const processedEvent = order.squareLastEventId
    ? await prisma.processedWebhookEvent.findUnique({
        where: { id: order.squareLastEventId },
      })
    : null;

  const signals = mismatchSignals(order, processedEvent);
  const action = suggestedAction(signals, order);

  const taskPending = order.tasks.filter((t) => t.status === "PENDING").length;
  const taskDone = order.tasks.filter((t) => t.status === "DONE").length;

  console.log("");
  console.log("=== CHEEKY OS ORDER STATE AUDIT ===");
  console.log("");
  console.log("Lookup:", `${key}=${value}`);
  if (lookupNote) console.log("Event ledger:", lookupNote);
  console.log("");
  console.log("Resolved Order:");
  console.log(`  id:              ${order.id}`);
  console.log(`  orderNumber:     ${order.orderNumber ?? "(none)"}`);
  console.log(`  status:          ${order.status}`);
  console.log(`  customerId:      ${order.customerId ?? "(none)"}`);
  console.log(`  email:           ${order.email ?? "(none)"}`);
  console.log(`  source:          ${order.source ?? "(none)"}`);
  console.log("");
  console.log("Square Refs:");
  console.log(`  squareOrderId:       ${order.squareOrderId ?? "(none)"}`);
  console.log(`  squarePaymentId:     ${order.squarePaymentId ?? "(none)"}`);
  console.log(`  squareInvoiceId:     ${order.squareInvoiceId ?? "(none)"}`);
  console.log(`  squareInvoiceNumber: ${order.squareInvoiceNumber ?? "(none)"}`);
  console.log(`  squareLastEventId:   ${order.squareLastEventId ?? "(none)"}`);
  console.log("");
  console.log("Payment Fields:");
  console.log(`  quotedAmount:     ${order.quotedAmount ?? "(none)"}`);
  console.log(`  totalAmount:      ${order.totalAmount}`);
  console.log(`  depositAmount:    ${order.depositAmount}`);
  console.log(`  depositRequired:  ${order.depositRequired ?? "(none)"}`);
  console.log(`  amountPaid:       ${order.amountPaid}`);
  console.log(`  depositReceived:  ${order.depositReceived}`);
  console.log(`  depositPaidAt:    ${formatIsoDate(order.depositPaidAt)}`);
  console.log(`  finalPaidAt:      ${formatIsoDate(order.finalPaidAt)}`);
  console.log(`  squareInvoiceStatus: ${order.squareInvoiceStatus ?? "(none)"}`);
  console.log(`  squarePaymentStatus: ${order.squarePaymentStatus ?? "(none)"}`);
  console.log("");
  console.log("Tasks / line items:");
  console.log(`  tasks total: ${order._count.tasks} (sample up to 20 below)`);
  console.log(`  line items:  ${order._count.lineItems}`);
  console.log(`  tasks PENDING: ${taskPending}  DONE: ${taskDone} (in sample)`);
  if (order.tasks.length) {
    console.log("  recent tasks:");
    for (const t of order.tasks) {
      console.log(`    - [${t.status}] ${t.title} (id=${t.id})`);
    }
  }
  console.log("");
  console.log("Webhook idempotency (last event on order):");
  if (order.squareLastEventId) {
    console.log(`  squareLastEventId: ${order.squareLastEventId}`);
    if (processedEvent) {
      console.log(
        `  ledger: eventType=${processedEvent.eventType} processedAt=${formatIsoDate(processedEvent.processedAt)}`
      );
    } else {
      console.log("  ledger: NO ROW for squareLastEventId (possible drift)");
    }
  } else {
    console.log("  (none)");
  }
  console.log("");
  console.log("Mismatch Signals:");
  if (signals.length === 0) {
    console.log("  (none flagged)");
  } else {
    for (const s of signals) {
      console.log(`  - ${s}`);
    }
  }
  console.log("");
  console.log("Suggested Action:");
  console.log(`  ${action}`);
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
