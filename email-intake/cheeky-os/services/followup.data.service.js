"use strict";

/**
 * PHASE 1 — Follow-Up Data Layer
 * Retrieves unpaid invoices for the cash collection engine.
 *
 * REUSE FIRST: wraps existing revenueFollowups.js (Square + Prisma).
 * FAIL SAFE: returns mock data if all real sources are unavailable.
 * NO AUTO-SEND. READ ONLY.
 */

const path = require("path");

// ─── Mock fallback ─────────────────────────────────────────────────────────────
const MOCK_INVOICES = [
  { customerName: "Fountain Inn High School", email: "admin@fihs.k12.sc.us", phone: "864-555-0101", amount: 480.00, daysOutstanding: 12, invoiceId: "mock-inv-001", source: "mock" },
  { customerName: "Carolina CrossFit",        email: "orders@carolinacrossfit.com", phone: "864-555-0202", amount: 325.00, daysOutstanding: 7, invoiceId: "mock-inv-002", source: "mock" },
  { customerName: "Simpsonville Parks & Rec", email: "parks@simpsonville.sc.gov", phone: "864-555-0303", amount: 900.00, daysOutstanding: 21, invoiceId: "mock-inv-003", source: "mock" },
  { customerName: "Upstate Boxing Club",      email: "coach@upstateboxing.com", phone: "864-555-0404", amount: 175.00, daysOutstanding: 5, invoiceId: "mock-inv-004", source: "mock" },
  { customerName: "Victory Church",           email: "office@victorychurch.org", phone: "864-555-0505", amount: 650.00, daysOutstanding: 14, invoiceId: "mock-inv-005", source: "mock" },
];

function toDollars(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

/**
 * Normalize a row from revenueFollowups into the standard invoice shape.
 */
function normalizeFollowupRow(row) {
  return {
    customerName: String(row.customerName || row.customer_name || "Unknown Customer").trim(),
    email: String(row.email || "").trim(),
    phone: String(row.phone || "").trim(),
    amount: typeof row.amount === "number" ? row.amount : toDollars(row.amount),
    daysOutstanding: Number(row.daysOld || row.daysPastDue || row.days_outstanding || 0),
    invoiceId: String(row.id || row.invoiceId || row.invoice_id || "").trim(),
    squareInvoiceId: String(row.squareInvoiceId || row.square_invoice_id || row.id || "").trim(),
    source: "square",
  };
}

/**
 * Try pulling from existing revenueFollowups service (wraps Square API).
 */
async function fromRevenueFollowups() {
  const svc = require("./revenueFollowups");
  if (typeof svc.getRevenueFollowups !== "function") return null;
  const result = await svc.getRevenueFollowups();
  const rows = result && Array.isArray(result.unpaidInvoices) ? result.unpaidInvoices : [];
  if (rows.length === 0) return null;
  return rows.map(normalizeFollowupRow);
}

/**
 * Try pulling directly from Prisma (orders with amountPaid = 0 and not closed).
 */
async function fromPrisma() {
  const prisma = (() => { try { return require(path.join(__dirname, "..", "..", "src", "lib", "prisma")); } catch (_) { return null; } })();
  if (!prisma) return null;

  const CLOSED = ["DONE", "COMPLETED", "CANCELLED", "CANCELED", "ARCHIVED", "LOST", "REFUNDED"];
  const orders = await prisma.order.findMany({
    where: {
      deletedAt: null,
      amountPaid: { lte: 0 },
      status: { notIn: CLOSED },
      totalAmount: { gt: 0 },
    },
    select: {
      id: true, customerName: true, email: true, phone: true,
      totalAmount: true, amountPaid: true, squareInvoiceId: true,
      createdAt: true, depositStatus: true, status: true,
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  if (orders.length === 0) return null;

  return orders.map((o) => ({
    customerName: o.customerName || "Unknown Customer",
    email: o.email || "",
    phone: o.phone || "",
    amount: Number(o.totalAmount || 0),
    daysOutstanding: o.createdAt
      ? Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000)
      : 0,
    invoiceId: o.squareInvoiceId || o.id,
    squareInvoiceId: o.squareInvoiceId || "",
    orderId: o.id,
    status: o.status,
    source: "prisma",
  }));
}

/**
 * Main entry — returns unpaid invoices for cash follow-up.
 * Priority: existing revenueFollowups → Prisma → mock.
 *
 * @param {number} [limit=10]
 * @returns {Promise<Array>}
 */
async function getUnpaidInvoices(limit) {
  const cap = Math.min(Number(limit) || 10, 50);

  // 1. Try existing Square-backed service
  try {
    const rows = await fromRevenueFollowups();
    if (rows && rows.length > 0) return rows.slice(0, cap);
  } catch (err) {
    console.warn("[followup.data] revenueFollowups failed:", err && err.message ? err.message : err);
  }

  // 2. Try Prisma direct
  try {
    const rows = await fromPrisma();
    if (rows && rows.length > 0) return rows.slice(0, cap);
  } catch (err) {
    console.warn("[followup.data] Prisma query failed:", err && err.message ? err.message : err);
  }

  // 3. Fallback mock
  console.warn("[followup.data] Using mock invoice data — no live source available.");
  return MOCK_INVOICES.slice(0, cap);
}

module.exports = { getUnpaidInvoices };
