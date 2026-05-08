"use strict";

/**
 * Phase 2 approval gate — JSON-backed pending + history (append-only resolutions).
 * No external mutations; statuses transition only pending -> approved/rejected.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const taskQueue = require("../agent/taskQueue");

const PENDING_FILE = "pending-approvals.json";
const HISTORY_FILE = "approval-history.json";

/** @typedef {object} ApprovalRecord */

function paths() {
  taskQueue.ensureDirAndFiles();
  return {
    pending: path.join(taskQueue.DATA_DIR, PENDING_FILE),
    history: path.join(taskQueue.DATA_DIR, HISTORY_FILE),
  };
}

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch (_e) {}
  return `ag-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function readJsonArray(p) {
  try {
    if (!fs.existsSync(p)) return [];
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(j) ? j : [];
  } catch (_e) {
    try {
      if (fs.existsSync(p)) fs.copyFileSync(p, `${p}.bak.${Date.now()}`);
    } catch (_e2) {}
    return [];
  }
}

function writeJsonArray(p, arr) {
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), "utf8");
  fs.renameSync(tmp, p);
}

function patrickActors() {
  const raw = String(process.env.CHEEKY_PATRICK_ACTORS || "patrick,owner,pat").toLowerCase();
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isPatrickOperator(operator) {
  const a = String(operator || "")
    .trim()
    .toLowerCase();
  if (!a) return false;
  if (a === "patrick" || a.includes("patrick")) return true;
  return patrickActors().some((x) => a === x || a.includes(x));
}

function requiresPatrickFromImpact(impactLevel) {
  const i = String(impactLevel || "medium").toLowerCase();
  return i !== "low";
}

/**
 * @param {object} payload
 * @returns {ApprovalRecord}
 */
function createApproval(payload) {
  const p = paths();
  const now = new Date().toISOString();
  const impactLevel = String(payload.impactLevel || "medium").toLowerCase();
  const requiresPatrick =
    typeof payload.requiresPatrick === "boolean" ? payload.requiresPatrick : requiresPatrickFromImpact(impactLevel);

  const row = {
    id: newId(),
    actionType: String(payload.actionType || "unspecified").slice(0, 120),
    orderId: payload.orderId != null ? String(payload.orderId).slice(0, 120) : null,
    customer: String(payload.customer || "").slice(0, 200),
    description: String(payload.description || "").slice(0, 2000),
    draftPayload: payload.draftPayload && typeof payload.draftPayload === "object" ? payload.draftPayload : {},
    impactLevel,
    moneyImpact: String(payload.moneyImpact || "unknown").slice(0, 80),
    requestedBy: String(payload.requestedBy || "operator").slice(0, 160),
    requiresPatrick,
    status: "pending",
    aiExplanation: String(payload.aiExplanation || "").slice(0, 2000),
    createdAt: now,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
  };

  const pending = readJsonArray(p.pending);
  pending.push(row);
  writeJsonArray(p.pending, pending);
  return row;
}

/**
 * @returns {{ ok: boolean, approval?: ApprovalRecord, error?: string, blocked?: boolean, message?: string }}
 */
function approveAction(actionId, operator, notes) {
  const p = paths();
  const id = String(actionId || "").trim();
  if (!id) return { ok: false, error: "missing_action_id" };

  const pending = readJsonArray(p.pending);
  const idx = pending.findIndex((x) => x && x.id === id);
  if (idx < 0) return { ok: false, error: "approval_not_found" };

  const rec = pending[idx];
  if (rec.status !== "pending") return { ok: false, error: "approval_not_pending" };

  if (rec.requiresPatrick && !isPatrickOperator(operator)) {
    return {
      ok: false,
      blocked: true,
      approvalId: rec.id,
      error: "patrick_required",
      message: "This action requires Patrick approval. Draft stays pending.",
    };
  }

  const now = new Date().toISOString();
  const resolved = Object.assign({}, rec, {
    status: "approved",
    resolvedAt: now,
    resolvedBy: String(operator || "unknown").slice(0, 160),
    resolutionNotes: notes != null ? String(notes).slice(0, 1000) : null,
  });

  pending.splice(idx, 1);
  writeJsonArray(p.pending, pending);

  const hist = readJsonArray(p.history);
  hist.push(resolved);
  writeJsonArray(p.history, hist);

  return { ok: true, approval: resolved };
}

/**
 * @returns {{ ok: boolean, approval?: ApprovalRecord, error?: string }}
 */
function rejectAction(actionId, operator, reason) {
  const p = paths();
  const id = String(actionId || "").trim();
  if (!id) return { ok: false, error: "missing_action_id" };

  const pending = readJsonArray(p.pending);
  const idx = pending.findIndex((x) => x && x.id === id);
  if (idx < 0) return { ok: false, error: "approval_not_found" };

  const rec = pending[idx];
  if (rec.status !== "pending") return { ok: false, error: "approval_not_pending" };

  /** Only Patrick may reject medium/high-impact customer/money drafts */
  if (rec.requiresPatrick && !isPatrickOperator(operator)) {
    return {
      ok: false,
      blocked: true,
      error: "patrick_required_reject",
      message: "Patrick must reject this gated item.",
      approvalId: rec.id,
    };
  }

  const now = new Date().toISOString();
  const resolved = Object.assign({}, rec, {
    status: "rejected",
    resolvedAt: now,
    resolvedBy: String(operator || "unknown").slice(0, 160),
    resolutionNotes: reason != null ? String(reason).slice(0, 1000) : "rejected",
  });

  pending.splice(idx, 1);
  writeJsonArray(p.pending, pending);

  const hist = readJsonArray(p.history);
  hist.push(resolved);
  writeJsonArray(p.history, hist);

  return { ok: true, approval: resolved };
}

function getPendingApprovals() {
  const p = paths();
  return readJsonArray(p.pending).filter((x) => x && x.status === "pending");
}

function getApprovalById(actionId) {
  const id = String(actionId || "").trim();
  if (!id) return null;

  const p = paths();
  const pend = readJsonArray(p.pending).find((x) => x && x.id === id);
  if (pend) return pend;

  const hist = readJsonArray(p.history).filter((x) => x && x.id === id);
  /** newest last in file */
  return hist.length ? hist[hist.length - 1] : null;
}

function getApprovalHistory(limit) {
  const lim = Math.min(800, Math.max(1, Number(limit) || 200));
  const rows = readJsonArray(paths().history);
  return rows.slice(-lim);
}

module.exports = {
  createApproval,
  approveAction,
  rejectAction,
  getPendingApprovals,
  getApprovalById,
  getApprovalHistory,
  patrickActors,
  isPatrickOperator,
};
