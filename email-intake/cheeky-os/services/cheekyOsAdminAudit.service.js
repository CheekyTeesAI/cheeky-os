"use strict";

/**
 * CHEEKY OS v4.1 — Append-only JSONL audit for authenticated admin/dashboard actions.
 * CHEEKY_ADMIN_AUDIT_LOG_FILE=log/cheeky-admin-audit.jsonl (relative to email-intake/)
 */

const fs = require("fs");
const path = require("path");

function baseRoot() {
  return path.join(__dirname, "..", "..");
}

function auditFileAbs() {
  const rel = String(process.env.CHEEKY_ADMIN_AUDIT_LOG_FILE || "log/cheeky-admin-audit.jsonl").trim();
  if (!rel) return null;
  return path.isAbsolute(rel) ? rel : path.join(baseRoot(), rel);
}

function recordAdminAudit({ action, actor, ip, meta }) {
  const abs = auditFileAbs();
  if (!abs) return;
  const rec = {
    ts: new Date().toISOString(),
    action: String(action || ""),
    actor: String(actor || "unknown"),
    ip: String(ip || ""),
    ...(meta && typeof meta === "object" ? meta : {}),
  };
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.appendFileSync(abs, JSON.stringify(rec) + "\n");
  } catch (e) {
    console.warn("[admin-audit] write failed:", e && e.message ? e.message : e);
  }
}

module.exports = { recordAdminAudit };
