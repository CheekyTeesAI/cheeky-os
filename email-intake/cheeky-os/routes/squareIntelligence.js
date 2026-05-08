"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");

const sqRead = require("../connectors/squareReadConnector");

const router = express.Router();

function actor(req) {
  try {
    const h = req.headers && req.headers["x-actor"];
    if (h) return String(h).slice(0, 160);
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
      metadata: { surface: "square_read", route: routePath, readOnly: true },
    });
  } catch (_e) {}
}

router.get("/api/intelligence/square/status", async (req, res) => {
  try {
    audit(req, "/api/intelligence/square/status");
    const rd = await sqRead.readiness();
    const okCfg = await sqRead.isConfigured();
    const sync = !!okCfg && !!(rd.authVerified && rd.locationId);
    return res.json({
      success: true,
      data: Object.assign({}, rd, { asyncConfiguredHints: !!sqRead.isConfiguredSync(), readyForRead: !!sync }),
    });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "status_failed" });
  }
});

router.get("/api/intelligence/square/revenue", async (req, res) => {
  try {
    audit(req, "/api/intelligence/square/revenue");
    const days = Number(req.query.days) || 7;
    const out = await sqRead.getRevenueSnapshot(days);
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "revenue_failed" });
  }
});

router.get("/api/intelligence/square/unpaid-invoices", async (req, res) => {
  try {
    audit(req, "/api/intelligence/square/unpaid-invoices");
    const out = await sqRead.findUnpaidInvoices();
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "unpaid_failed" });
  }
});

router.get("/api/intelligence/square/recent-payments", async (req, res) => {
  try {
    audit(req, "/api/intelligence/square/recent-payments");
    const days = Number(req.query.days) || 7;
    const out = await sqRead.listRecentPayments(days);
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "payments_failed" });
  }
});

router.get("/api/intelligence/square/estimate-followups", async (req, res) => {
  try {
    audit(req, "/api/intelligence/square/estimate-followups");
    const out = await sqRead.getEstimateFollowups();
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "estimates_failed" });
  }
});

router.get("/api/intelligence/square/customers", async (req, res) => {
  try {
    audit(req, "/api/intelligence/square/customers");
    const q = String(req.query.q || "").trim();
    const out = await sqRead.searchCustomers(q);
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "customers_failed" });
  }
});

module.exports = router;
