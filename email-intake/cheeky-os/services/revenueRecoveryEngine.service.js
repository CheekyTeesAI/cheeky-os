"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const {
  effectiveTotal,
  depositCollected,
} = require("./cashRiskEngine.service");
const {
  loadOrdersForSales,
  quoteAmount,
  quoteSentAtMs,
  HIGH_VALUE_USD,
} = require("./salesEngineV1.service");

const MS_HOUR = 3600000;

function recoveryQueuePath() {
  return path.join(__dirname, "..", "..", "data", "revenue-recovery-queue.json");
}

function readRecoveryStore() {
  const p = recoveryQueuePath();
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!j || typeof j !== "object") return { updatedAt: null, items: [] };
    if (!Array.isArray(j.items)) j.items = [];
    return j;
  } catch (_) {
    return { updatedAt: null, items: [] };
  }
}

function writeRecoveryStore(obj) {
  const p = recoveryQueuePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `rr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function slimDetectRow(row) {
  return {
    type: row.type,
    urgency: row.urgency,
    customer: row.customer,
    ...(row.orderId ? { orderId: row.orderId } : {}),
    reason: row.reason,
  };
}

/**
 * Detection only — no send, no auto-queue.
 * @returns {Promise<object[]>}
 */
async function detectFollowups() {
  const { orders } = await loadOrdersForSales();
  const now = Date.now();
  const out = [];
  const seen = new Set();

  function add(key, row) {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  }

  for (const order of orders) {
    if (order.deletedAt) continue;
    const st = String(order.status || "").toUpperCase();
    if (st === "CANCELLED") continue;

    const paid = Number(order.amountPaid || 0);
    const total = effectiveTotal(order);
    const hasDep = depositCollected(order);

    if (order.readyForPickup === true && order.pickupNotified !== true && st !== "CANCELLED") {
      add(`pickup:${order.id}`, {
        type: "PICKUP_NOTICE",
        urgency: "HIGH",
        customer: order.customerName || "",
        orderId: order.id,
        reason: "Order ready for pickup — customer not notified",
      });
    }

    const exp = order.invoiceExpiresAt || order.quoteExpiresAt;
    if (exp) {
      const expMs = new Date(exp).getTime();
      if (!Number.isNaN(expMs) && expMs < now && paid + 1e-6 < total) {
        add(`coll:${order.id}`, {
          type: "COLLECTION_NOTICE",
          urgency: "HIGH",
          customer: order.customerName || "",
          orderId: order.id,
          reason: `Balance $${Math.max(0, total - paid).toFixed(2)} past invoice/quote deadline`,
        });
      }
    }

    if (hasDep && total > 1e-6 && paid + 1e-6 < total) {
      add(`partial:${order.id}`, {
        type: "DEPOSIT_REMINDER",
        urgency: "MEDIUM",
        customer: order.customerName || "",
        orderId: order.id,
        reason: `Deposit received; balance $${(total - paid).toFixed(2)} remaining`,
      });
    }

    for (const quote of order.quotes || []) {
      const qst = String(quote.status || "").toUpperCase();
      const sentSignals =
        ["SENT", "OPEN", "PENDING"].includes(qst) || (qst === "DRAFT" && !!order.squareInvoiceSentAt);
      if (!sentSignals) continue;
      if (depositCollected(order)) continue;

      const amt = quoteAmount(quote, order);
      const sentMs = quoteSentAtMs(quote, order);
      const hours = Math.max(0, Math.floor((now - sentMs) / MS_HOUR));

      if (amt >= HIGH_VALUE_USD) {
        add(`hv:${order.id}:${quote.id}`, {
          type: "HIGH_VALUE_QUOTE",
          urgency: hours >= 48 ? "HIGH" : "MEDIUM",
          customer: order.customerName || "",
          orderId: order.id,
          quoteId: quote.id,
          reason: `High-value quote (~$${Math.round(amt)}) — priority close`,
        });
      }

      if (hours >= 72) {
        add(`urg:${order.id}:${quote.id}`, {
          type: "URGENT_FOLLOWUP",
          urgency: "URGENT",
          customer: order.customerName || "",
          orderId: order.id,
          quoteId: quote.id,
          reason: `Quote outstanding ${hours}h — urgent follow-up`,
        });
      } else if (hours >= 24) {
        add(`fu:${order.id}:${quote.id}`, {
          type: "QUOTE_FOLLOWUP",
          urgency: "HIGH",
          customer: order.customerName || "",
          orderId: order.id,
          quoteId: quote.id,
          reason: `Quote outstanding ${hours}h — follow up`,
        });
      }
    }
  }

  function rank(t) {
    const u = t.urgency === "URGENT" ? 4 : t.urgency === "HIGH" ? 3 : t.urgency === "MEDIUM" ? 2 : 1;
    return u * 100 + (t.type === "COLLECTION_NOTICE" ? 50 : 0);
  }
  out.sort((a, b) => rank(b) - rank(a));
  return out;
}

/**
 * @param {object} item — detection row + optional email
 * @returns {{ messageType: string, subject: string, body: string }}
 */
function generateFollowupMessage(item) {
  const name = String(item.customer || "there").trim() || "there";
  const typ = String(item.detectionType || item.type || "QUOTE_FOLLOWUP").toUpperCase();
  let messageType = "QUOTE_FOLLOWUP";
  let subject = "Cheeky — quick update";
  let body = "";

  switch (typ) {
    case "QUOTE_FOLLOWUP":
      messageType = "QUOTE_FOLLOWUP";
      subject = `Cheeky — your quote`;
      body = `Hi ${name},\n\nWant to check in on the quote we sent. If you’re good to move forward, reply here and we’ll send the deposit link. If anything needs to change, tell us what to tweak.\n\nThanks,\nCheeky`;
      break;
    case "URGENT_FOLLOWUP":
    case "HIGH_VALUE_QUOTE":
      messageType = typ === "URGENT_FOLLOWUP" ? "URGENT_FOLLOWUP" : "QUOTE_FOLLOWUP";
      subject = `Cheeky — still interested?`;
      body = `Hi ${name},\n\nFollowing up again — we’d love to lock this in when you’re ready. Reply with any questions or a “yes” and we’ll keep momentum on your order.\n\nThanks,\nCheeky`;
      break;
    case "DEPOSIT_REMINDER":
      messageType = "DEPOSIT_REMINDER";
      subject = `Cheeky — balance on your order`;
      body = `Hi ${name},\n\nThanks again for your deposit. There’s a remaining balance when you’re ready — reply here and we’ll resend the link or answer questions.\n\nThanks,\nCheeky`;
      break;
    case "COLLECTION_NOTICE":
      messageType = "COLLECTION_NOTICE";
      subject = `Cheeky — invoice reminder`;
      body = `Hi ${name},\n\nFriendly reminder on the open balance we discussed. If something doesn’t look right, reply and we’ll fix it fast. When you’re ready to pay, we’ll make it painless.\n\nThanks,\nCheeky`;
      break;
    case "PICKUP_NOTICE":
      messageType = "PICKUP_NOTICE";
      subject = `Cheeky — your order is ready`;
      body = `Hi ${name},\n\nYour order is ready for pickup. Reply for hours/location or to arrange pickup — we’ll hold it for you.\n\nThanks,\nCheeky`;
      break;
    default:
      body = `Hi ${name},\n\nTouching base from Cheeky — reply when you can.\n\nThanks,\nCheeky`;
  }

  return { messageType, subject, body };
}

/**
 * Merge detected follow-ups into queue as DRAFT (deduped).
 * @param {object[]} [detected] — from detectFollowups(); if omitted, runs detection.
 * @returns {{ added: number, items: object[] }}
 */
async function queueFollowupMessages(detected) {
  const list = Array.isArray(detected) ? detected : await detectFollowups();
  const store = readRecoveryStore();
  let added = 0;

  for (const d of list) {
    const fp = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          t: d.type,
          oid: d.orderId || "",
          qid: d.quoteId || "",
        })
      )
      .digest("hex")
      .slice(0, 32);

    const open = store.items.find(
      (i) =>
        i.fingerprint === fp && (i.status === "DRAFT" || i.status === "APPROVED")
    );
    if (open) continue;

    const { body } = generateFollowupMessage({ ...d, detectionType: d.type });
    store.items.push({
      id: newId(),
      customer: d.customer || "",
      message: body,
      status: "DRAFT",
      createdAt: new Date().toISOString(),
      orderId: d.orderId || null,
      quoteId: d.quoteId || null,
      email: null,
      followupType: d.type,
      urgency: d.urgency || "MEDIUM",
      fingerprint: fp,
    });
    added += 1;
  }

  store.updatedAt = new Date().toISOString();
  writeRecoveryStore(store);
  return { added, items: store.items };
}

function listRevenueRecoveryQueue() {
  return readRecoveryStore().items;
}

/**
 * @param {string} id
 * @param {{ status?: string }} patch
 */
function patchRecoveryQueueItem(id, patch) {
  const store = readRecoveryStore();
  const row = store.items.find((i) => i && i.id === id);
  if (!row) return { ok: false, error: "not_found" };
  const st = String((patch && patch.status) || "").toUpperCase();
  if (!["DRAFT", "APPROVED", "SENT"].includes(st)) {
    return { ok: false, error: "invalid_status" };
  }
  row.status = st;
  row.updatedAt = new Date().toISOString();
  store.updatedAt = row.updatedAt;
  writeRecoveryStore(store);
  return { ok: true, item: row };
}

/**
 * @param {object[]} detected
 */
function estimateCashRecoveryUsd(detected) {
  return detected.length * 150;
}

/** Heuristic $ at play using open balances from orders */
async function estimateCashRecoveryFromOrders() {
  const { orders } = await loadOrdersForSales();
  let sum = 0;
  for (const o of orders) {
    if (o.deletedAt) continue;
    if (depositCollected(o) && String(o.status || "").toUpperCase() === "COMPLETED") continue;
    const t = effectiveTotal(o);
    const p = Number(o.amountPaid || 0);
    if (t > p + 1e-6) sum += t - p;
  }
  return Math.round(sum * 100) / 100;
}

function enrichQueueEmails(items, orders) {
  const byId = new Map((orders || []).map((o) => [o.id, o]));
  return items.map((i) => {
    const o = i.orderId ? byId.get(i.orderId) : null;
    return {
      ...i,
      email: i.email || (o && o.email) || "",
    };
  });
}

/**
 * @returns {Promise<object>}
 */
async function buildFollowupsTodayPayload() {
  await queueFollowupMessages();
  const detected = await detectFollowups();
  const store = readRecoveryStore();
  const { orders } = await loadOrdersForSales();
  const items = enrichQueueEmails(store.items, orders);

  const highPriority = detected.filter((d) =>
    ["URGENT_FOLLOWUP", "COLLECTION_NOTICE", "PICKUP_NOTICE", "HIGH_VALUE_QUOTE"].includes(d.type)
  );
  const quickWins = detected.filter((d) =>
    ["QUOTE_FOLLOWUP", "DEPOSIT_REMINDER"].includes(d.type) && d.urgency !== "URGENT"
  );

  const messagesReady = items
    .filter((i) => i.status === "DRAFT" || i.status === "APPROVED")
    .slice(0, 80)
    .map((i) => ({
      id: i.id,
      customer: i.customer,
      status: i.status,
      followupType: i.followupType,
      orderId: i.orderId,
      excerpt: typeof i.message === "string" && i.message.length > 160 ? `${i.message.slice(0, 157)}…` : i.message,
    }));

  return {
    total: detected.length,
    highPriority: highPriority.slice(0, 30).map(slimDetectRow),
    quickWins: quickWins.slice(0, 30).map(slimDetectRow),
    messagesReady,
    estimatedRecoverableUsd: await estimateCashRecoveryFromOrders(),
  };
}

/**
 * @returns {Promise<{ required: object[], readyToSend: object[], estimatedCashRecovery: number }>}
 */
async function buildOperatorFollowupsBlock() {
  const detected = await detectFollowups();
  await queueFollowupMessages(detected);
  const items = enrichQueueEmails(readRecoveryStore().items, (await loadOrdersForSales()).orders);
  const recovery = await estimateCashRecoveryFromOrders();

  return {
    required: detected.slice(0, 25).map(slimDetectRow),
    readyToSend: items.filter((i) => i.status === "APPROVED").map((i) => ({
      id: i.id,
      customer: i.customer,
      orderId: i.orderId,
      followupType: i.followupType,
      message: i.message,
    })),
    estimatedCashRecovery: recovery,
  };
}

const REVENUE_RECOVERY_META = {
  status: "REVENUE_RECOVERY_ACTIVE",
  followupsDetected: true,
  messagesDrafted: true,
  approvalRequired: true,
  cashRecoveryActive: true,
  nextAction: "Approve and send top 5 followups daily",
};

module.exports = {
  detectFollowups,
  generateFollowupMessage,
  queueFollowupMessages,
  listRevenueRecoveryQueue,
  patchRecoveryQueueItem,
  estimateCashRecoveryUsd,
  estimateCashRecoveryFromOrders,
  buildFollowupsTodayPayload,
  buildOperatorFollowupsBlock,
  readRecoveryStore,
  REVENUE_RECOVERY_META,
};
