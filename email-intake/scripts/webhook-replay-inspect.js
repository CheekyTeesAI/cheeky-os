#!/usr/bin/env node
/**
 * Cheeky OS — webhook replay / duplicate signal inspection (read-only).
 *
 * Uses DB truth: ProcessedWebhookEvent (idempotency ledger) + Order linkage fields.
 * Does not call Square APIs or reprocess webhooks.
 *
 * Usage (exactly one flag):
 *   node scripts/webhook-replay-inspect.js --eventId <square_event_id>
 *   node scripts/webhook-replay-inspect.js --squarePaymentId <id>
 *   node scripts/webhook-replay-inspect.js --squareInvoiceId <id>
 *   node scripts/webhook-replay-inspect.js --orderNumber <string>
 *   node scripts/webhook-replay-inspect.js --orderId <uuid>
 *   node scripts/webhook-replay-inspect.js --squareOrderId <id>
 *   node scripts/webhook-replay-inspect.js --squareInvoiceNumber <num>
 */

const {
  loadDotenvFromEmailIntake,
  parsePairArgs,
  collectLookups,
  formatIsoDate,
  setExitNotFound,
  setExitAmbiguous,
} = require("./_operator-helpers");

loadDotenvFromEmailIntake();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const LOOKUP_KEYS = [
  "eventId",
  "orderId",
  "orderNumber",
  "squareOrderId",
  "squarePaymentId",
  "squareInvoiceId",
  "squareInvoiceNumber",
];

const orderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  squarePaymentId: true,
  squareInvoiceId: true,
  squareInvoiceNumber: true,
  squareOrderId: true,
  squareLastEventId: true,
  amountPaid: true,
  updatedAt: true,
};

async function findOrdersAmbiguous(where) {
  const rows = await prisma.order.findMany({
    where: { ...where, deletedAt: null },
    select: orderSelect,
  });
  return rows;
}

async function inspectByEventId(value) {
  const ledger = await prisma.processedWebhookEvent.findUnique({
    where: { id: value },
  });
  const orders = await findOrdersAmbiguous({ squareLastEventId: value });
  return { ledger, orders, lookupKey: "eventId", lookupValue: value };
}

async function inspectByOrderField(field, value) {
  const where = { [field]: value };
  const orders = await findOrdersAmbiguous(where);
  return { ledger: null, orders, lookupKey: field, lookupValue: value };
}

function buildReplayClues({ ledger, orders, lookupKey }) {
  const clues = [];
  let suggested = "run order-state-audit on the resolved order id for full money-path context";

  if (ledger) {
    clues.push(
      `likely already processed: ProcessedWebhookEvent row exists (id=${ledger.id}, eventType=${ledger.eventType}, processedAt=${formatIsoDate(ledger.processedAt)})`
    );
  } else if (lookupKey === "eventId") {
    clues.push(
      "insufficient evidence for idempotency: no ProcessedWebhookEvent row for this event id (never recorded, or different id string)"
    );
  }

  if (orders.length === 0) {
    clues.push(
      "no matching Order rows (non-deleted) for this lookup — cannot tie to order state"
    );
    suggested = "avoid replay until identifiers are confirmed; verify Square payload event_id and order linkage fields";
    return { clues, suggested };
  }

  if (orders.length > 1) {
    return {
      clues: [
        ...clues,
        "AMBIGUOUS: multiple orders match — duplicate linkage or non-unique lookup",
      ],
      suggested: "needs manual audit; narrow to order id or a unique Square ref",
    };
  }

  const o = orders[0];
  if (o.squareLastEventId && ledger && o.squareLastEventId === ledger.id) {
    clues.push(
      "order.squareLastEventId matches ledger id — linkage consistent with successful processing path"
    );
  } else if (o.squareLastEventId && ledger && o.squareLastEventId !== ledger.id) {
    clues.push(
      "possible duplicate risk: order.squareLastEventId differs from looked-up event id (partial retries or out-of-order updates)"
    );
  } else if (o.squareLastEventId && !ledger && lookupKey === "eventId") {
    clues.push(
      "possible drift: order references this event id as squareLastEventId but no ledger row (migration/partial write)"
    );
  }

  if (o.squarePaymentId) {
    clues.push(
      `payment ref on order: squarePaymentId set — payment.completed handler treats duplicate payment id as duplicate (see squarePaymentHandler)`
    );
  }

  if (!ledger && lookupKey !== "eventId") {
    clues.push(
      "ledger not queried for non-event lookup — check order.squareLastEventId below if investigating a specific event"
    );
  }

  if (orders.length === 1 && ledger) {
    suggested =
      "likely already processed for this event id; avoid manual replay without payload review; run order-state-audit if money state looks wrong";
  }

  return { clues, suggested };
}

async function main() {
  const args = parsePairArgs(process.argv);
  const lookups = collectLookups(args, LOOKUP_KEYS);

  if (lookups.length !== 1) {
    console.error(
      "Usage: provide exactly one of:\n  " +
        LOOKUP_KEYS.map((k) => `--${k} <value>`).join("\n  ")
    );
    setExitNotFound();
    return;
  }

  const { key, value } = lookups[0];

  let pack;
  if (key === "eventId") {
    pack = await inspectByEventId(value);
  } else if (key === "orderId") {
    pack = await inspectByOrderField("id", value);
  } else if (key === "orderNumber") {
    pack = await inspectByOrderField("orderNumber", value);
  } else if (key === "squareOrderId") {
    pack = await inspectByOrderField("squareOrderId", value);
  } else if (key === "squarePaymentId") {
    pack = await inspectByOrderField("squarePaymentId", value);
  } else if (key === "squareInvoiceId") {
    pack = await inspectByOrderField("squareInvoiceId", value);
  } else if (key === "squareInvoiceNumber") {
    pack = await inspectByOrderField("squareInvoiceNumber", value);
  } else {
    console.error("operator: unsupported key");
    setExitNotFound();
    return;
  }

  let { ledger, orders } = pack;

  if (key !== "eventId" && orders.length === 1 && orders[0].squareLastEventId) {
    const ev = await prisma.processedWebhookEvent.findUnique({
      where: { id: orders[0].squareLastEventId },
    });
    ledger = ev;
  }

  const ambiguous = orders.length > 1;

  console.log("");
  console.log("=== CHEEKY OS WEBHOOK REPLAY INSPECTION ===");
  console.log("");
  console.log("Lookup:", `${key}=${value}`);
  console.log("");

  if (ambiguous) {
    console.log("Resolved Signals:");
    console.log("- processed event found:", ledger ? `yes (${ledger.id})` : "not checked / not found");
    console.log("- matching order found: AMBIGUOUS (multiple rows)");
    console.log("");
    console.log("Replay / Duplicate Clues:");
    console.log("- possible duplicate risk: multiple orders share this lookup — needs manual audit");
    console.log("");
    console.log("Suggested Next Action:");
    console.log("- needs manual audit; use a unique key (order id or squarePaymentId if unique)");
    console.log("");
    setExitAmbiguous();
    return;
  }

  if (orders.length === 0 && key === "eventId") {
    const onlyLedger = pack.ledger;
    console.log("Resolved Signals:");
    console.log(
      "- processed event found:",
      onlyLedger ? `yes (eventType=${onlyLedger.eventType}, processedAt=${formatIsoDate(onlyLedger.processedAt)})` : "not found"
    );
    console.log("- matching order found: not found (no order.squareLastEventId match)");
    console.log("- payment ref found / not found: n/a (no order)");
    console.log("- invoice ref found / not found: n/a (no order)");
    console.log("");
    console.log("Replay / Duplicate Clues:");
    if (onlyLedger) {
      console.log("- likely already processed: ledger row exists; no order currently references this event id");
    } else {
      console.log("- insufficient evidence: no ledger row and no order match");
    }
    console.log("");
    console.log("Suggested Next Action:");
    console.log(
      onlyLedger
        ? "- run order-state-audit if you expected an order update; check webhook payload linkage"
        : "- avoid replay until identifiers are confirmed; verify event id string"
    );
    console.log("");
    if (onlyLedger) {
      process.exitCode = 0;
    } else {
      setExitNotFound();
    }
    return;
  }

  if (orders.length === 0) {
    console.log("Resolved Signals:");
    console.log("- processed event found: not applicable (no order to infer event)");
    console.log("- matching order found: NOT FOUND");
    console.log("");
    console.log("Replay / Duplicate Clues:");
    console.log("- insufficient evidence: no order row for this lookup");
    console.log("");
    console.log("Suggested Next Action:");
    console.log("- verify identifier; run order-state-audit only after you have a valid order id");
    console.log("");
    setExitNotFound();
    return;
  }

  const o = orders[0];
  const lastEv = o.squareLastEventId
    ? await prisma.processedWebhookEvent.findUnique({
        where: { id: o.squareLastEventId },
      })
    : null;

  if (key !== "eventId") {
    ledger = lastEv;
  }

  const { clues, suggested } = buildReplayClues({
    ledger: key === "eventId" ? pack.ledger : ledger,
    orders,
    lookupKey: key,
  });

  console.log("Resolved Signals:");
  console.log(
    "- processed event found:",
    key === "eventId"
      ? pack.ledger
        ? `yes (${pack.ledger.id}, type=${pack.ledger.eventType})`
        : "not found"
      : o.squareLastEventId
        ? lastEv
          ? `yes (order.squareLastEventId → ${lastEv.id})`
          : `missing ledger row for order.squareLastEventId=${o.squareLastEventId} (possible drift)`
        : "not set on order (no last event id stored)"
  );
  console.log("- matching order found: yes", `(id=${o.id}, orderNumber=${o.orderNumber ?? "(none)"})`);
  console.log(
    "- payment ref found:",
    o.squarePaymentId ? `yes (${o.squarePaymentId})` : "not set"
  );
  console.log(
    "- invoice ref found:",
    o.squareInvoiceId || o.squareInvoiceNumber
      ? `yes (invoiceId=${o.squareInvoiceId ?? "(none)"} number=${o.squareInvoiceNumber ?? "(none)"})`
      : "not set"
  );
  console.log("");
  console.log("Replay / Duplicate Clues:");
  for (const c of clues) {
    console.log(`- ${c}`);
  }
  console.log("");
  console.log("Suggested Next Action:");
  console.log(`- ${suggested}`);
  console.log("- manual repair only after audit confirms intended state");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    setExitNotFound();
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
