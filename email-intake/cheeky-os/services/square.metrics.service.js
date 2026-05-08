"use strict";

/**
 * PHASE 2 — Square Metrics Service
 * Pulls payment data from Square API (last 7 days).
 * Wraps existing square-client credentials + squareSync status if available.
 *
 * FAIL SAFE: All functions return fallback zeros if Square is down or unconfigured.
 * NO AUTO-SEND. READ ONLY.
 */

const path = require("path");

const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN || "";
const BASE_URL = "https://connect.squareup.com/v2";

function toDollars(cents) {
  return Number(cents || 0) / 100;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

async function squareFetch(endpoint, body, method) {
  if (!SQUARE_TOKEN) return null;
  try {
    const fetch = require("node-fetch");
    const opts = {
      method: method || (body ? "POST" : "GET"),
      headers: {
        "Authorization": `Bearer ${SQUARE_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-01-17",
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${endpoint}`, opts);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

/**
 * Try to load node-fetch — v2 (CommonJS) required.
 * Returns false if not available.
 */
function hasFetch() {
  try { require("node-fetch"); return true; } catch (_) { return false; }
}

async function getPaymentsLast7Days() {
  if (!hasFetch() || !SQUARE_TOKEN) return [];
  const data = await squareFetch("/payments", {
    begin_time: daysAgo(7),
    sort_order: "DESC",
  }, "GET");
  return (data && Array.isArray(data.payments)) ? data.payments : [];
}

async function getUnpaidInvoices() {
  if (!hasFetch() || !SQUARE_TOKEN) return 0;
  // Try squareSync status first (already pulled from DB)
  try {
    const squareSyncSvc = require(path.join(__dirname, "..", "..", "squareSync", "squareSync.service"));
    if (typeof squareSyncSvc.getSquareSyncStatus === "function") {
      const status = await squareSyncSvc.getSquareSyncStatus();
      if (status && status.summary) return Number(status.summary.ordersUnpaid || 0);
    }
  } catch (_) {}

  // Fallback: call Square invoices API
  const data = await squareFetch("/invoices?status=UNPAID&limit=200");
  if (data && Array.isArray(data.invoices)) return data.invoices.length;
  return 0;
}

/**
 * Main entry — returns Square financial metrics for snapshot.
 * @returns {Promise<{revenueToday: number, revenue7DayAvg: number, unpaidInvoices: number, cashOnHand: number}>}
 */
async function getMetrics() {
  const empty = { revenueToday: 0, revenue7DayAvg: 0, unpaidInvoices: 0, cashOnHand: 0 };

  try {
    const [payments, unpaidCount] = await Promise.all([
      getPaymentsLast7Days(),
      getUnpaidInvoices(),
    ]);

    const today = new Date().toDateString();
    let revenueToday = 0;
    let revenue7Day = 0;

    for (const p of payments) {
      if (p.status !== "COMPLETED") continue;
      const amount = toDollars(p.amount_money && p.amount_money.amount);
      revenue7Day += amount;
      if (new Date(p.created_at).toDateString() === today) {
        revenueToday += amount;
      }
    }

    const revenue7DayAvg = payments.length > 0 ? revenue7Day / 7 : 0;

    return {
      revenueToday: Math.round(revenueToday * 100) / 100,
      revenue7DayAvg: Math.round(revenue7DayAvg * 100) / 100,
      unpaidInvoices: unpaidCount,
      cashOnHand: 0,  // requires bank API integration — not in scope
    };
  } catch (err) {
    console.warn("[square.metrics] error — returning zeros:", err && err.message ? err.message : err);
    return empty;
  }
}

module.exports = { getMetrics };
