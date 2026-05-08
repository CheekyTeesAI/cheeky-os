"use strict";

/**
 * Square Sync — Audit Logger
 * Writes every sync event to Prisma AuditLog (entity: square_sync).
 * Falls back to JSONL at data/square-sync-audit.jsonl.
 * IRON LAW: Never log Square access tokens or secrets.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const AUDIT_FILE = path.join(__dirname, "..", "data", "square-sync-audit.jsonl");

function generateId() {
  return `ss-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function ensureDir() {
  try { fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true }); } catch (_) {}
}

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

/**
 * Write a Square sync audit entry.
 * @param {object} entry
 * @returns {Promise<{auditId: string, mode: string}>}
 */
async function writeSyncAudit(entry) {
  const id = entry.id || generateId();

  const safe = {
    id,
    timestamp: entry.timestamp || new Date().toISOString(),
    source: "square-sync",
    mode: String(entry.mode || "unknown"),
    eventType: String(entry.eventType || "unknown"),
    squarePaymentId: entry.squarePaymentId || null,
    squareInvoiceId: entry.squareInvoiceId || null,
    squareOrderId: entry.squareOrderId || null,
    orderId: entry.orderId || null,
    allowed: entry.allowed !== undefined ? Boolean(entry.allowed) : true,
    blocked: entry.blocked !== undefined ? Boolean(entry.blocked) : false,
    riskLevel: String(entry.riskLevel || "unknown"),
    result: String(entry.result || ""),
    paymentStatus: entry.paymentStatus || null,
    depositStatus: entry.depositStatus || null,
    amountPaid: entry.amountPaid != null ? Number(entry.amountPaid) : null,
    amountTotal: entry.amountTotal != null ? Number(entry.amountTotal) : null,
    productionEligible: entry.productionEligible != null ? Boolean(entry.productionEligible) : null,
    error: entry.error ? String(entry.error) : null,
  };

  // Try Prisma AuditLog
  try {
    const prisma = getPrisma();
    if (prisma && typeof prisma.auditLog.create === "function") {
      const saved = await prisma.auditLog.create({
        data: {
          stage: "square_sync",
          input: JSON.stringify({
            mode: safe.mode,
            eventType: safe.eventType,
            squarePaymentId: safe.squarePaymentId,
            squareInvoiceId: safe.squareInvoiceId,
            orderId: safe.orderId,
            amountPaid: safe.amountPaid,
            amountTotal: safe.amountTotal,
          }),
          output: JSON.stringify({
            allowed: safe.allowed,
            blocked: safe.blocked,
            result: safe.result,
            paymentStatus: safe.paymentStatus,
            depositStatus: safe.depositStatus,
            productionEligible: safe.productionEligible,
            error: safe.error,
          }),
          status: safe.blocked ? "blocked" : "allowed",
          action: safe.eventType,
          entity: "square_sync",
          entityId: safe.orderId || safe.squareInvoiceId || null,
          details: JSON.stringify({
            riskLevel: safe.riskLevel,
            source: safe.source,
            mode: safe.mode,
            timestamp: safe.timestamp,
          }),
        },
        select: { id: true },
      });
      return { auditId: saved.id, mode: "persistent" };
    }
  } catch (err) {
    console.warn("[square-sync/audit] Prisma write failed:", err && err.message ? err.message : err);
  }

  // File fallback
  try {
    ensureDir();
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(safe) + "\n", "utf8");
    return { auditId: id, mode: "file" };
  } catch (err) {
    console.error("[square-sync/audit] file write failed:", err && err.message ? err.message : err);
    return { auditId: id, mode: "memory_only" };
  }
}

/**
 * Read recent Square sync audit entries.
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function readSyncAudit(limit) {
  const take = Math.min(Number(limit) || 50, 200);

  // Try Prisma
  try {
    const prisma = getPrisma();
    if (prisma && typeof prisma.auditLog.findMany === "function") {
      const rows = await prisma.auditLog.findMany({
        where: { entity: "square_sync" },
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          createdAt: true,
          action: true,
          status: true,
          input: true,
          output: true,
          details: true,
          entityId: true,
        },
      });

      return rows.map((r) => {
        let inp = {};
        let out = {};
        let det = {};
        try { inp = JSON.parse(r.input || "{}"); } catch (_) {}
        try { out = JSON.parse(r.output || "{}"); } catch (_) {}
        try { det = JSON.parse(r.details || "{}"); } catch (_) {}

        return {
          id: r.id,
          timestamp: r.createdAt,
          source: "square-sync",
          mode: det.mode,
          eventType: r.action,
          orderId: r.entityId,
          squareInvoiceId: inp.squareInvoiceId,
          squarePaymentId: inp.squarePaymentId,
          amountPaid: inp.amountPaid,
          amountTotal: inp.amountTotal,
          allowed: out.allowed,
          blocked: out.blocked,
          riskLevel: det.riskLevel,
          result: out.result,
          paymentStatus: out.paymentStatus,
          depositStatus: out.depositStatus,
          productionEligible: out.productionEligible,
          error: out.error,
        };
      });
    }
  } catch (_) {}

  // File fallback
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const content = fs.readFileSync(AUDIT_FILE, "utf8").trim();
    if (!content) return [];
    const lines = content.split("\n").filter(Boolean);
    const entries = lines
      .map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
      .filter(Boolean);
    return entries.reverse().slice(0, take);
  } catch (_) {
    return [];
  }
}

module.exports = { writeSyncAudit, readSyncAudit };
