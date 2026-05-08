"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const PRIMARY_VENDOR = "Carolina Made";
const SECONDARY_VENDORS = ["S&S", "SanMar", "AlphaBroder", "ShirtSpace", "Delta", "Brisco"];

function draftPath() {
  return path.join(taskQueue.DATA_DIR, "garment-order-drafts.jsonl");
}

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return `go-${crypto.randomUUID()}`;
  } catch (_e) {}
  return `go-${Date.now()}`;
}

function appendDraft(row) {
  taskQueue.ensureDirAndFiles();
  fs.appendFileSync(draftPath(), `${JSON.stringify(row)}\n`, "utf8");
  return { ok: true };
}

function readAllDrafts(limit) {
  taskQueue.ensureDirAndFiles();
  const p = draftPath();
  if (!fs.existsSync(p)) return [];
  const lines = fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean);
  const n = Math.min(500, Math.max(1, Number(limit) || 200));
  /** @type {object[]} */
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < n; i--) {
    try {
      out.push(JSON.parse(lines[i]));
    } catch (_e) {}
  }
  return out;
}

/**
 * @param {{ orderId?: string, customerName?: string, styles?: object[], notes?: string }} spec
 */
function createCarolinaMadeDraft(spec) {
  const s = spec || {};
  const row = {
    id: newId(),
    vendor: PRIMARY_VENDOR,
    approvalRequired: true,
    status: "DRAFT",
    createdAt: new Date().toISOString(),
    orderId: s.orderId || null,
    customerName: String(s.customerName || "").slice(0, 200),
    styles: Array.isArray(s.styles) ? s.styles : [],
    notes: String(s.notes || "").slice(0, 2000),
    policy: {
      autoSendEmail: false,
      autoPurchase: false,
      squareMutation: false,
    },
    secondaryVendorDirectory: SECONDARY_VENDORS,
  };
  appendDraft(row);
  return row;
}

function listDrafts(limit) {
  return readAllDrafts(limit);
}

module.exports = {
  PRIMARY_VENDOR,
  SECONDARY_VENDORS,
  createCarolinaMadeDraft,
  listDrafts,
  readAllDrafts,
};
