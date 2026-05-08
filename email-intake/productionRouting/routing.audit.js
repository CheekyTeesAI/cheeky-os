"use strict";

/**
 * Production Routing — Audit Logger
 * Uses Prisma AuditLog (entity: production_routing).
 * Falls back to JSONL at data/production-routing-audit.jsonl.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const AUDIT_FILE = path.join(__dirname, "..", "data", "production-routing-audit.jsonl");

function generateId() {
  return `pr-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function ensureDir() {
  try { fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true }); } catch (_) {}
}

function getPrisma() {
  try { return require(path.join(__dirname, "..", "src", "lib", "prisma")); } catch (_) { return null; }
}

async function writeRoutingAudit(entry) {
  const id = entry.id || generateId();
  const safe = {
    id,
    timestamp: new Date().toISOString(),
    source: "production-routing",
    action: String(entry.action || "unknown"),
    orderId: entry.orderId || null,
    jobId: entry.jobId || null,
    method: entry.method || null,
    assignee: entry.assignee || null,
    allowed: entry.allowed !== undefined ? Boolean(entry.allowed) : true,
    blocked: entry.blocked !== undefined ? Boolean(entry.blocked) : false,
    reason: entry.reason ? String(entry.reason) : null,
    result: entry.result ? String(entry.result) : null,
    error: entry.error ? String(entry.error) : null,
  };

  try {
    const prisma = getPrisma();
    if (prisma && typeof prisma.auditLog.create === "function") {
      const saved = await prisma.auditLog.create({
        data: {
          stage: "production_routing",
          input: JSON.stringify({ orderId: safe.orderId, method: safe.method }),
          output: JSON.stringify({ allowed: safe.allowed, blocked: safe.blocked, result: safe.result, jobId: safe.jobId }),
          status: safe.blocked ? "blocked" : "allowed",
          action: safe.action,
          entity: "production_routing",
          entityId: safe.orderId || safe.jobId || null,
          details: JSON.stringify({ assignee: safe.assignee, reason: safe.reason, error: safe.error }),
        },
        select: { id: true },
      });
      return { auditId: saved.id, mode: "persistent" };
    }
  } catch (err) {
    console.warn("[routing/audit] Prisma write failed:", err && err.message ? err.message : err);
  }

  try {
    ensureDir();
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(safe) + "\n", "utf8");
    return { auditId: id, mode: "file" };
  } catch (err) {
    return { auditId: id, mode: "memory_only" };
  }
}

async function readRoutingAudit(limit) {
  const take = Math.min(Number(limit) || 50, 200);
  try {
    const prisma = getPrisma();
    if (prisma && typeof prisma.auditLog.findMany === "function") {
      const rows = await prisma.auditLog.findMany({
        where: { entity: "production_routing" },
        orderBy: { createdAt: "desc" },
        take,
        select: { id: true, createdAt: true, action: true, status: true, input: true, output: true, details: true, entityId: true },
      });
      return rows.map((r) => {
        let inp = {}; let out = {}; let det = {};
        try { inp = JSON.parse(r.input || "{}"); } catch (_) {}
        try { out = JSON.parse(r.output || "{}"); } catch (_) {}
        try { det = JSON.parse(r.details || "{}"); } catch (_) {}
        return { id: r.id, timestamp: r.createdAt, action: r.action, orderId: r.entityId, ...inp, ...out, ...det };
      });
    }
  } catch (_) {}
  try {
    if (!fs.existsSync(AUDIT_FILE)) return [];
    const lines = fs.readFileSync(AUDIT_FILE, "utf8").trim().split("\n").filter(Boolean);
    return lines.map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean).reverse().slice(0, take);
  } catch (_) { return []; }
}

module.exports = { writeRoutingAudit, readRoutingAudit };
