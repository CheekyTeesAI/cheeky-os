"use strict";

/**
 * Customer-visible search + status (read-only Prisma snapshot).
 * No internal notes, no raw blockers, no approval payloads, no autonomous sends.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const draftHelpers = require("../drafting/draftOrderHelpers");
const wf = require("../workflow/orderWorkflowRules");

const PHASE5_GUARDRAIL =
  "You are the Cheeky Tees operational AI co-pilot. Protect cashflow and production; never send communications automatically; " +
  "never expose sensitive internal data; customer sees clarity only.";

const TOKEN_FILE = "customer-status-links.json";

function tokensPath() {
  taskQueue.ensureDirAndFiles();
  return path.join(taskQueue.DATA_DIR, TOKEN_FILE);
}

function readTokenStore() {
  const p = tokensPath();
  if (!fs.existsSync(p))
    return { tokens: {}, note: null };
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" ? j : { tokens: {} };
  } catch (_e) {
    return { tokens: {} };
  }
}

function writeTokenStore(doc) {
  const p = tokensPath();
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function normalizePhone(s) {
  return String(s || "").replace(/\D/g, "").slice(-10);
}

function customerSafeStage(order) {
  const canon = wf.deriveCanonicalStageFromOrder(order);
  const map = {
    COMPLETED: { label: "Completed", timeline: "Your order looks finished — thank you!", hint: "" },
    READY_FOR_PICKUP: { label: "Ready for pickup / delivery prep", timeline: "Often within a business day of final QC.", hint: "" },
    QC: { label: "Quality check", timeline: "We are verifying print quality.", hint: "" },
    IN_PRODUCTION: { label: "Production", timeline: "On press — timing depends on size and blanks.", hint: "" },
    PRODUCTION_READY: { label: "Ready for production scheduling", timeline: "Production should start shortly after blanks + approvals.", hint: "" },
    DIGITIZING: { label: "Art preparation / digitizing", timeline: "Artwork is receiving specialist attention.", hint: "" },
    ART_NEEDED: { label: "Artwork needed", timeline: "We need files or proofs before advancing.", hint: "" },
    ART_CHECK: { label: "Art review / proof", timeline: "Waiting on proof approvals when applicable.", hint: "" },
    ON_HOLD: { label: "On hold briefly", timeline: "The shop is aligning details — we'll update you shortly.", hint: "" },
    GARMENTS_ORDERED: { label: "Blanks ordered", timeline: "Apparel supplier lead time applies.", hint: "" },
    GARMENTS_NEEDED: { label: "Apparel sourcing", timeline: "We pick blanks after approvals and deposits.", hint: "" },
    AWAITING_DEPOSIT: { label: "Awaiting deposit before production", timeline: "Once deposit posts, timelines firm up.", hint: "" },
    INVOICE_SENT: { label: "Invoice delivered", timeline: "Please complete deposit instructions from your invoice.", hint: "" },
    ESTIMATE_SENT: { label: "Estimate phase", timeline: "We are aligning pricing — reply with questions anytime.", hint: "" },
    INTAKE: { label: "Intake review", timeline: "We are reviewing scope and quoting.", hint: "" },
    EVALUATE_APPROVE: { label: "Internal review", timeline: "The team is approving details before releasing to production.", hint: "" },
    DEPOSIT_PAID: { label: "Deposit received — moving ahead", timeline: "Next steps are art and apparel scheduling.", hint: "" },
    APPROVED_FOR_PRODUCTION: { label: "Approved for production pathway", timeline: "Prep for garments and presses.", hint: "" },
    WORK_ORDER_CREATED: { label: "Work order drafted", timeline: "Internal queue is catching up with blanks + art.", hint: "" },
  };
  const row = map[canon] || { label: "In progress", timeline: "We will share concrete timing when we confirm blanks + art gates.", hint: "" };
  return { canonical: canon, ...row };
}

/**
 * Plain English payment hint — no card data, minimal numbers.
 *
 * @param {object|null} order
 */
function paymentSummarySafe(order) {
  if (!order) return "unknown";
  if (wf.depositPaid(order)) {
    if (order.completedAt || String(order.status || "").toUpperCase() === "COMPLETED") return "Balance looks settled for this milestone — Square remains the invoice source of truth.";
    return "Deposit received — invoice balance may still apply before pickup per your paperwork.";
  }
  if (order.squareInvoiceId || order.squareInvoicePublished)
    return "Invoice on file — Cheeky will confirm deposit/posting before presses run.";
  return "Payments still coordinating — rely on emailed Square invoices for authoritative totals.";
}

/**
 * Soft blocker wording for customer (never raw blockerReason strings).
 *
 * @param {object|null} order
 */
function blockerHintSafe(order) {
  if (!order || !order.blockedReason || !String(order.blockedReason).trim()) return "";
  const st = wf.deriveCanonicalStageFromOrder(order);
  if (st === "ON_HOLD") return "Your order paused briefly — a Cheeky specialist will reconnect with timing.";
  if (!wf.depositPaid(order)) return "We'll move forward publicly once deposit aligns with printed policy.";
  if (!wf.artIsApproved(order)) return "We're waiting on finalized artwork approvals before presses run.";
  if (wf.depositPaid(order) && !order.garmentsReceived && order.garmentOrderNeeded !== false)
    return "We're coordinating apparel blanks — blanks affect production dates.";
  return "We're aligning internal steps — reply to your coordinator if you need a human update.";
}

/**
 * Score match for sorting.
 *
 * @param {object} o
 * @param {string} q
 * @param {string} qDigits
 */
function matchScore(o, q, qDigits) {
  let s = 0;
  const on = String(o.orderNumber || "").toLowerCase();
  const cid = String(o.id || "").toLowerCase();
  const nm = String(o.customerName || "").toLowerCase();
  const em = String(o.email || "").toLowerCase();
  const ph = normalizePhone(o.phone || "");
  if (on && on.includes(q)) s += 8;
  if (cid.includes(q)) s += 5;
  if (nm.includes(q)) s += 4;
  if (em.includes(q)) s += 5;
  if (qDigits && ph && ph.endsWith(qDigits)) s += 6;
  return s;
}

/**
 * Shared filter for lookups.
 *
 * @param {object[]} rows
 * @param {string} q
 */
function filterMatches(rows, q) {
  const raw = String(q || "").trim();
  const lower = raw.toLowerCase().slice(0, 96);
  const qDigits = normalizePhone(raw);
  /** @type {object[]} */
  const scored = [];
  rows.forEach((o) => {
    if (!o) return;
    const sc = matchScore(o, lower, qDigits.length >= 3 ? qDigits : "");
    if (sc > 0) scored.push({ o, sc });
  });
  scored.sort((a, b) => b.sc - a.sc);
  return scored.map((x) => x.o).slice(0, 36);
}

/**
 * Minimal order row for JSON response — customer safe.
 *
 * @param {object} o
 */
function mapOrderBrief(o) {
  const cs = customerSafeStage(o);
  return {
    id: o.id,
    reference: String(o.orderNumber || "").trim() ? `Order ${o.orderNumber}` : "Order reference on file",
    orderNumber: String(o.orderNumber || "").slice(0, 32) || "pending_review",
    productionStageCustomer: cs.label,
    timelineHintCustomer: cs.timeline,
    blockerHintCustomerSafe: blockerHintSafe(o),
    paymentSummaryCustomerSafe: paymentSummarySafe(o),
    lastUpdatedCustomerSafe: String(o.updatedAt || o.updated_at || "").slice(0, 32) || "unknown",
  };
}

async function customerSearchEnvelope(query) {
  const q = String(query || "").trim();
  const orders = await draftHelpers.loadOrdersForDrafts(600);
  if (!orders.length || !q) {
    return {
      customer: "unknown",
      orders: [],
      currentStatus: "pending_review",
      customerFriendlyMessage: "We could not locate orders from that entry yet — widen your spelling or reply with email on file.",
      estimatedTimeline: "Our team confirms timelines after verifying your inquiry.",
      lastUpdated: new Date().toISOString(),
      safeLinkPlaceholder: "/cheeky-os-ui/customer-status.html — share after staff issues a lookup link.",
      guardrailEcho: PHASE5_GUARDRAIL,
    };
  }

  const matches = filterMatches(orders, q);
  const customerName =
    matches[0]
      ? String(matches[0].customerName || matches[0].email || "").split(/\s+|@/)[0] || "Customer"
      : "Customer";

  if (!matches.length) {
    return {
      customer: "unknown",
      orders: [],
      currentStatus: "unknown",
      customerFriendlyMessage:
        "No matching active jobs were found — try your email exactly as used on the quote or the order number from your paperwork.",
      estimatedTimeline: "Once we locate your quote, timelines follow deposit + apparel + art checkpoints.",
      lastUpdated: new Date().toISOString(),
      safeLinkPlaceholder: `/cheeky-os-ui/customer-status.html`,
      guardrailEcho: PHASE5_GUARDRAIL,
    };
  }

  const primary = matches[0];
  const csPrimary = customerSafeStage(primary);

  /** @returns {Promise<string>} */
  async function makeToken(ids) {
    const token =
      typeof crypto.randomBytes === "function"
        ? "cs-" + crypto.randomBytes(16).toString("hex")
        : "cs-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

    const store = readTokenStore();
    store.tokens[token] = {
      orderIds: ids.slice(0, 8),
      emailNorm:
        String(primary.email || "")
          .trim()
          .toLowerCase()
          .slice(0, 160) || "unknown",
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 30 * 86400000,
    };
    writeTokenStore(store);
    return token;
  }

  const ids = [...new Set(matches.map((x) => x.id).filter(Boolean))];
  let tokenIssued = null;
  try {
    if (matches.length <= 6) tokenIssued = await makeToken(ids);
  } catch (_tok) {}

  const safeLink =
    tokenIssued && typeof tokenIssued === "string"
      ? `/cheeky-os-ui/customer-status.html?token=${encodeURIComponent(tokenIssued)}`
      : "/cheeky-os-ui/customer-status.html";

  return {
    customer: String(primary.customerName || "").trim() || primary.email?.split("@")[0] || customerName,
    orders: matches.slice(0, 10).map(mapOrderBrief),
    currentStatus: csPrimary.label,
    customerFriendlyMessage: `Thanks for checking in, ${customerName}. Your latest milestone with us reads as "${csPrimary.label}". Reply to any Cheeky email thread for the fastest human clarification.`,
    estimatedTimeline: csPrimary.timeline,
    lastUpdated:
      String(primary.updatedAt instanceof Date ? primary.updatedAt.toISOString() : primary.updatedAt || "").slice(0, 32) ||
      new Date().toISOString(),
    safeLink,
    safeLinkExpiresNote: tokenIssued ? "This link refreshes approximate status for ~30 days — screenshots are informational only." : null,
    guardrailEcho: PHASE5_GUARDRAIL,
  };
}

async function lookupByShareToken(token) {
  const t = String(token || "").trim().slice(0, 220);
  if (!t.startsWith("cs-"))
    return { ok: false, reason: "invalid_token_format", data: customerSearchEnvelopeSyncEmpty("invalid_token_format") };

  const store = readTokenStore();
  const row = store.tokens && store.tokens[t];
  if (!row || !Array.isArray(row.orderIds))
    return { ok: false, reason: "expired_or_missing", data: customerSearchEnvelopeSyncEmpty("expired_or_missing") };

  if (row.expiresAt && Date.now() > row.expiresAt)
    return { ok: false, reason: "expired", data: customerSearchEnvelopeSyncEmpty("expired") };

  /** @type {object[]} */
  const loads = [];
  for (let i = 0; i < row.orderIds.length; i++) {
    try {
      const o = await draftHelpers.loadOrderById(row.orderIds[i]);
      if (o) loads.push(o);
    } catch (_e) {}
  }

  const env = loads.length ? await summarizeOrders(loads.slice(0, 8)) : customerSearchEnvelopeSyncEmpty("pending_review");
  return { ok: true, data: env };
}

/**
 * Order[] -> envelope shaped like search response
 *
 * @param {object[]} orders
 */
async function summarizeOrders(orders) {
  if (!orders || !orders.length) return customerSearchEnvelopeSyncEmpty("pending_review");
  const primary = orders[0];
  const csPrimary = customerSafeStage(primary);
  const name = String(primary.customerName || "").trim() || primary.email?.split("@")[0] || "Customer";
  return {
    customer: name,
    orders: orders.slice(0, 10).map(mapOrderBrief),
    currentStatus: csPrimary.label,
    customerFriendlyMessage: `Here's the latest milestone we have on file (${csPrimary.label}). Timelines depend on blanks + proofs — ping your coordinator for exact commitments.`,
    estimatedTimeline: csPrimary.timeline,
    lastUpdated:
      String(primary.updatedAt instanceof Date ? primary.updatedAt.toISOString() : primary.updatedAt || "").slice(0, 32) ||
      new Date().toISOString(),
    safeLink: "/cheeky-os-ui/customer-status.html — bookmark saves this informational view.",
    guardrailEcho: PHASE5_GUARDRAIL,
  };
}

/** @deprecated small helper when no prisma rows */
function customerSearchEnvelopeSyncEmpty(reason) {
  return {
    customer: reason === "expired_or_missing" || reason === "expired" ? "unknown" : "pending_review",
    orders: [],
    currentStatus: "pending_review",
    customerFriendlyMessage: "Your status link cooled off or could not reload — reconnect with Cheeky for a fresh update.",
    estimatedTimeline: "We restate timelines only after validating your inquiry.",
    lastUpdated: new Date().toISOString(),
    guardrailEcho: PHASE5_GUARDRAIL,
  };
}

module.exports = {
  customerSearchEnvelope,
  lookupByShareToken,
  PHASE5_GUARDRAIL,
  filterMatches,
  mapOrderBrief,
};
