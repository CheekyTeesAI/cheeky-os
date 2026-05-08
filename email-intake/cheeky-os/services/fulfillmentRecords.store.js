"use strict";

/**
 * Fulfillment payload stored per order (additive JSON — no Prisma migration).
 */

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "..", "..", "data", "fulfillment-records.json");

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadRaw() {
  ensureDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j.byOrderId !== "object") return { byOrderId: {} };
    return j;
  } catch {
    return { byOrderId: {} };
  }
}

function saveRaw(data) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function defaultRecord(orderId) {
  const id = String(orderId || "").trim();
  return {
    orderId: id,
    fulfillmentMethod: "UNKNOWN",
    fulfillmentStatus: "NOT_READY",
    shippingName: "",
    shippingAddress1: "",
    shippingAddress2: "",
    shippingCity: "",
    shippingState: "",
    shippingZip: "",
    shippingCountry: "US",
    shippingPhone: "",
    packageWeightOz: null,
    packageLengthIn: null,
    packageWidthIn: null,
    packageHeightIn: null,
    trackingNumber: "",
    carrier: "",
    labelUrl: "",
    fulfilledAt: null,
    fulfillmentNote: "",
    updatedAt: new Date().toISOString(),
  };
}

function getRecord(orderId) {
  const id = String(orderId || "").trim();
  if (!id) return null;
  const data = loadRaw();
  const cur = data.byOrderId[id];
  if (!cur) return { ...defaultRecord(id) };
  return { ...defaultRecord(id), ...cur, orderId: id };
}

function saveRecord(orderId, patch) {
  const id = String(orderId || "").trim();
  if (!id) throw new Error("orderId required");
  const data = loadRaw();
  const prev = data.byOrderId[id] || defaultRecord(id);
  const next = {
    ...prev,
    ...patch,
    orderId: id,
    updatedAt: new Date().toISOString(),
  };
  data.byOrderId[id] = next;
  saveRaw(data);
  return next;
}

function listAllRecords() {
  const data = loadRaw();
  return Object.values(data.byOrderId || {});
}

module.exports = {
  DATA_FILE,
  getRecord,
  saveRecord,
  listAllRecords,
  defaultRecord,
};
