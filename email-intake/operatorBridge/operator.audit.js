"use strict";

/**
 * Operator Bridge — Audit Log
 * Writes every command preview and execute to the Prisma AuditLog model.
 * Falls back to JSONL file at data/operator-audit.jsonl if Prisma is unavailable.
 * IRON LAW: Never log secrets, tokens, or raw credentials.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const AUDIT_FILE = path.join(__dirname, "..", "data", "operator-audit.jsonl");

function generateAuditId() {
  return `ob-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function ensureAuditDir() {
  try {
    fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
  } catch (_) {}
}

function getPrismaClient() {
  try {
    // Reuse the singleton Prisma client used throughout Cheeky OS
    const lib = require(path.join(__dirname, "..", "src", "lib", "prisma"));
    return lib && lib.auditLog ? lib : null;
  } catch (_) {
    return null;
  }
}

/**
 * Write a single audit entry.
 * @param {object} entry
 * @returns {Promise<{auditId: string, mode: string}>}
 */
async function writeAudit(entry) {
  const id = entry.id || generateAuditId();

  const safe = {
    id,
    timestamp: entry.timestamp || new Date().toISOString(),
    requestedBy: String(entry.requestedBy || "unknown"),
    commandType: String(entry.commandType || "UNKNOWN"),
    intent: String(entry.intent || ""),
    payloadSummary: entry.payloadSummary || {},
    mode: String(entry.mode || "unknown"),
    allowed: entry.allowed !== undefined ? Boolean(entry.allowed) : true,
    blocked: entry.blocked !== undefined ? Boolean(entry.blocked) : false,
    riskLevel: String(entry.riskLevel || "unknown"),
    resultSummary: String(entry.resultSummary || ""),
    error: entry.error ? String(entry.error) : null,
  };

  // Never log sensitive fields
  delete safe.payloadSummary.squareToken;
  delete safe.payloadSummary.accessToken;
  delete safe.payloadSummary.apiKey;

  // Attempt Prisma AuditLog
  try {
    const prisma = getPrismaClient();
    if (prisma && typeof prisma.auditLog.create === "function") {
      const saved = await prisma.auditLog.create({
        data: {
          stage: "operator_bridge",
          input: JSON.stringify({
            commandType: safe.commandType,
            intent: safe.intent,
            requestedBy: safe.requestedBy,
            payloadSummary: safe.payloadSummary,
          }),
          output: JSON.stringify({
            allowed: safe.allowed,
            blocked: safe.blocked,
            resultSummary: safe.resultSummary,
            error: safe.error,
          }),
          status: safe.blocked ? "blocked" : "allowed",
          action: safe.commandType,
          entity: "operator_bridge",
          entityId: null,
          details: JSON.stringify({
            mode: safe.mode,
            riskLevel: safe.riskLevel,
            requestedBy: safe.requestedBy,
            timestamp: safe.timestamp,
          }),
        },
        select: { id: true },
      });
      return { auditId: saved.id, mode: "persistent" };
    }
  } catch (prismaErr) {
    // Non-fatal — fall through to file
    console.warn("[operator-bridge/audit] Prisma write failed, using file fallback:", prismaErr && prismaErr.message ? prismaErr.message : prismaErr);
  }

  // File fallback
  try {
    ensureAuditDir();
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(safe) + "\n", "utf8");
    return { auditId: id, mode: "file" };
  } catch (fileErr) {
    console.error("[operator-bridge/audit] File write failed:", fileErr && fileErr.message ? fileErr.message : fileErr);
    return { auditId: id, mode: "memory_only" };
  }
}

/**
 * Read recent audit entries.
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function readAudit(limit) {
  const take = Math.min(Number(limit) || 50, 200);

  // Attempt Prisma
  try {
    const prisma = getPrismaClient();
    if (prisma && typeof prisma.auditLog.findMany === "function") {
      const rows = await prisma.auditLog.findMany({
        where: { entity: "operator_bridge" },
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
          commandType: r.action || inp.commandType,
          requestedBy: inp.requestedBy,
          intent: inp.intent,
          payloadSummary: inp.payloadSummary,
          mode: det.mode,
          allowed: out.allowed,
          blocked: out.blocked,
          riskLevel: det.riskLevel,
          resultSummary: out.resultSummary,
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

module.exports = { writeAudit, readAudit };
