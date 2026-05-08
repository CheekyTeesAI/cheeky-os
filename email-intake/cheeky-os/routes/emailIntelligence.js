"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");

const graph = require("../connectors/graphEmailConnector");

const router = express.Router();

function actor(req) {
  try {
    const h = req.headers && req.headers["x-actor"];
    if (h) return String(h).slice(0, 160);
    if (req.query && req.query.requestedBy) return String(req.query.requestedBy).slice(0, 160);
    return "http";
  } catch (_e) {
    return "http";
  }
}

function audit(req, routePath) {
  try {
    safety.auditLog({
      eventType: "intelligence_read",
      taskId: null,
      actor: actor(req),
      metadata: { surface: "email", route: routePath, readOnly: true },
    });
  } catch (_e) {}
}

router.get("/api/intelligence/email/status", (req, res) => {
  try {
    audit(req, "/api/intelligence/email/status");
    const configured = graph.isConfigured();
    return res.json({
      success: true,
      data: {
        configured,
        mailboxUserMasked: configured ? `${String(process.env.MS_GRAPH_MAILBOX_USER || "").slice(0, 3)}***` : null,
        readOnly: true,
      },
    });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "status_failed" });
  }
});

router.get("/api/intelligence/email/recent", async (req, res) => {
  try {
    audit(req, "/api/intelligence/email/recent");
    const lim = Math.min(40, Math.max(1, Number(req.query.limit) || 10));
    if (!graph.isConfigured()) {
      return res.json({ success: true, data: { ok: false, error: "graph_not_configured", messages: [] } });
    }
    const payload = await graph.getRecentInbox(lim);
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "recent_failed" });
  }
});

router.get("/api/intelligence/email/search", async (req, res) => {
  try {
    audit(req, "/api/intelligence/email/search");
    const q = String(req.query.q || "").trim();
    if (!graph.isConfigured()) {
      return res.json({ success: true, data: { ok: false, error: "graph_not_configured", messages: [] } });
    }
    const payload = await graph.searchEmails(q, { limit: Number(req.query.limit) || 20 });
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "search_failed" });
  }
});

router.get("/api/intelligence/email/last-contact", async (req, res) => {
  try {
    audit(req, "/api/intelligence/email/last-contact");
    const contact = String(req.query.contact || "").trim();
    if (!graph.isConfigured()) {
      return res.json({ success: true, data: { ok: false, error: "graph_not_configured", email: null } });
    }
    const payload = await graph.getLastEmailFromContact(contact);
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "last_contact_failed" });
  }
});

router.get("/api/intelligence/email/health", async (req, res) => {
  try {
    audit(req, "/api/intelligence/email/health");
    if (!graph.isConfigured()) {
      return res.json({ success: true, data: { ok: false, configured: false, stage: "env_missing", readOnly: true } });
    }
    const tok = await graph.getAccessToken();
    if (!tok.ok) {
      return res.json({ success: true, data: { ok: false, configured: true, stage: "token", error: tok.error, readOnly: true } });
    }
    const probe = await graph.healthProbe();
    return res.json({ success: true, data: Object.assign({}, probe, { readOnly: true }) });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "email_health_failed" });
  }
});

router.get("/api/intelligence/email/message", async (req, res) => {
  try {
    audit(req, "/api/intelligence/email/message");
    const id = String(req.query.id || "").trim();
    if (!graph.isConfigured()) {
      return res.json({ success: true, data: { ok: false, error: "graph_not_configured" } });
    }
    const payload = await graph.getMessageById(id);
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "message_failed" });
  }
});

router.get("/api/intelligence/email/unread", async (req, res) => {
  try {
    audit(req, "/api/intelligence/email/unread");
    const lim = Math.min(80, Math.max(1, Number(req.query.limit) || 25));
    if (!graph.isConfigured()) {
      return res.json({ success: true, data: { ok: false, error: "graph_not_configured", messages: [] } });
    }
    const unread = await graph.getUnreadRecent(lim);
    let folderStats = null;
    try {
      folderStats = await graph.getInboxFolderStats();
    } catch (_f) {}
    return res.json({
      success: true,
      data: Object.assign({}, unread, { inboxFolderStats: folderStats || null }),
    });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "unread_failed" });
  }
});

module.exports = router;
