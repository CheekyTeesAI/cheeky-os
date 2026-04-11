/**
 * Cheeky OS — Local JSON data store.
 * File-backed persistence for customers, deals, payments, and events.
 * Works immediately without any external services.
 *
 * @module cheeky-os/data/local-store
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");

const FILES = {
  customers: path.join(DATA_DIR, "cheeky-customers.json"),
  deals: path.join(DATA_DIR, "cheeky-deals.json"),
  payments: path.join(DATA_DIR, "cheeky-payments.json"),
  events: path.join(DATA_DIR, "cheeky-events.json"),
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function ensureFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "[]", "utf8");
}

function readJSON(filePath) {
  ensureFile(filePath);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return [];
  }
}

function writeJSON(filePath, data) {
  ensureFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function upsert(filePath, record) {
  const now = new Date().toISOString();
  if (!record.id) record.id = Date.now().toString();
  record.updatedAt = now;

  const records = readJSON(filePath);
  const idx = records.findIndex((r) => r.id === record.id);

  if (idx >= 0) {
    records[idx] = { ...records[idx], ...record };
  } else {
    if (!record.createdAt) record.createdAt = now;
    records.push(record);
  }

  writeJSON(filePath, records);
  return idx >= 0 ? records[idx] : record;
}

// ── Customers ───────────────────────────────────────────────────────────────

async function getCustomers() {
  return readJSON(FILES.customers);
}

async function saveCustomer(customer) {
  return upsert(FILES.customers, customer);
}

async function findCustomerByEmail(email) {
  if (!email) return null;
  const all = readJSON(FILES.customers);
  return all.find((c) => c.email && c.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findCustomerByName(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  const all = readJSON(FILES.customers);
  return all.find((c) => c.name && c.name.toLowerCase().trim() === normalized) || null;
}

// ── Deals ───────────────────────────────────────────────────────────────────

async function getDeals() {
  return readJSON(FILES.deals);
}

async function saveDeal(deal) {
  return upsert(FILES.deals, deal);
}

async function getOpenDeals() {
  const all = readJSON(FILES.deals);
  return all.filter((d) => d.status !== "paid" && d.stage !== "closed");
}

async function findDealByInvoiceId(invoiceId) {
  if (!invoiceId) return null;
  const all = readJSON(FILES.deals);
  return all.find((d) => d.invoiceId === invoiceId) || null;
}

async function findDealById(id) {
  if (!id) return null;
  const all = readJSON(FILES.deals);
  return all.find((d) => d.id === id) || null;
}

async function updateDeal(id, updates) {
  const records = readJSON(FILES.deals);
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  records[idx] = { ...records[idx], ...updates, updatedAt: new Date().toISOString() };
  writeJSON(FILES.deals, records);
  return records[idx];
}

// ── Payments ────────────────────────────────────────────────────────────────

async function getPayments() {
  return readJSON(FILES.payments);
}

async function savePayment(payment) {
  return upsert(FILES.payments, payment);
}

// ── Events ──────────────────────────────────────────────────────────────────

async function getEvents() {
  return readJSON(FILES.events);
}

async function saveEvent(event) {
  if (!event.createdAt) event.createdAt = new Date().toISOString();
  return upsert(FILES.events, event);
}

module.exports = {
  getCustomers,
  saveCustomer,
  findCustomerByEmail,
  findCustomerByName,
  getDeals,
  saveDeal,
  getOpenDeals,
  findDealByInvoiceId,
  findDealById,
  updateDeal,
  getPayments,
  savePayment,
  getEvents,
  saveEvent,
};
