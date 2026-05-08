"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");

const semanticTaskEngine = require("../memory/semanticTaskEngine");

const delegationEngine = require("../subagents/delegationEngine");

const eventEmitter = require("../events/eventEmitter");

const eventQuery = require("../events/eventQuery");

const eventReducer = require("../events/eventReducer");

const graphQuery = require("../graph/graphQuery");

const recommendationEngine = require("../planning/recommendationEngine");

const voiceIntentRouter = require("../voice/voiceIntentRouter");

const orchestrationRecovery = require("../agent/orchestrationRecovery");

const processorLock = require("../agent/processorLock");

const relationshipEngine = require("../graph/relationshipEngine");

const entityRegistry = require("../graph/entityRegistry");

const router = express.Router();

function transportAuthorized(req) {
  try {
    const env = String(process.env.CHEEKY_TRANSPORT_KEY || "").trim();
    if (!env) return false;
    const h = String((req.headers && req.headers["x-cheeky-transport-key"]) || "").trim();
    const b = req.body && req.body.transportKey != null ? String(req.body.transportKey).trim() : "";
    return h === env || b === env;
  } catch (_e) {
    return false;
  }
}

router.get("/api/agent-intel/v31/ping", (_req, res) => {
  try {
    return res.json({
      success: true,
      data: {
        version: "3.1",
        processorDefaultOff: String(process.env.AGENT_PROCESSOR_ENABLED || "").toLowerCase() !== "true",
      },
    });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "ping_failed" });
  }
});

router.get("/api/agent-intel/v31/stale-recovery/preview", (_req, res) => {
  try {
    return res.json({ success: true, data: { note: "run on boot via server; manual preview only", windowMs: orchestrationRecovery.RUNNING_STALE_MS } });
  } catch (_e) {
    return res.status(500).json({ success: false });
  }
});

router.get("/api/agent-intel/v31/lock/status", (_req, res) => {
  try {
    return res.json({ success: true, data: processorLock.readLock() });
  } catch (_e) {
    return res.status(500).json({ success: false });
  }
});

router.get("/api/agent-intel/v31/semantic/related", (req, res) => {
  try {
    const hint = {
      intent: String(req.query.intent || ""),
      target: String(req.query.target || ""),
      requirements: String(req.query.requirements || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const out = semanticTaskEngine.findRelatedTasks(hint, Number(req.query.limit) || 8);
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "semantic_failed" });
  }
});

router.post("/api/agent-intel/v31/semantic/related", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = semanticTaskEngine.findRelatedTasks(body, Number(body.limit) || 8);
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "semantic_failed" });
  }
});

router.get("/api/agent-intel/v31/delegate", (req, res) => {
  try {
    const task = {
      intent: String(req.query.intent || ""),
      target: String(req.query.target || ""),
      requirements: String(req.query.requirements || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const pick = delegationEngine.pickAgentForTask(task);
    return res.json({ success: true, data: pick });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "delegate_failed" });
  }
});

router.post("/api/agent-intel/v31/delegate", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const pick = delegationEngine.pickAgentForTask(body);
    return res.json({ success: true, data: pick });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "delegate_failed" });
  }
});

router.post("/api/agent-intel/v31/events/append", (req, res) => {
  try {
    if (!transportAuthorized(req)) {
      return res.status(401).json({ success: false, error: "transport_key_required_or_mismatch" });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const evt = body.event && typeof body.event === "object" ? body.event : body;
    const r = eventEmitter.appendExpandedEvent(evt);
    if (!r.ok) {
      return res.status(400).json({ success: false, data: r });
    }
    return res.json({ success: true, data: r });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "event_append_failed" });
  }
});

router.get("/api/agent-intel/v31/events/query", (req, res) => {
  try {
    const q = eventQuery.query({
      type: req.query.type,
      customerId: req.query.customerId,
      taskId: req.query.taskId,
      orderId: req.query.orderId,
      fromIso: req.query.from,
      toIso: req.query.to,
      limit: Number(req.query.limit) || 80,
    });
    return res.json({ success: true, data: q });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "event_query_failed" });
  }
});

router.get("/api/agent-intel/v31/events/summary", (req, res) => {
  try {
    const pool = eventQuery.parseLines();
    const hours = Number(req.query.hours) || 24;
    const sum = eventReducer.summarize(pool, hours);
    return res.json({ success: true, data: sum });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "event_summary_failed" });
  }
});

router.get("/api/agent-intel/v31/graph/neighbors", (req, res) => {
  try {
    const center = String(req.query.centerId || "");
    if (!center) {
      return res.status(400).json({ success: false, error: "centerId_required" });
    }
    const n = graphQuery.neighborhood(center, {
      maxDepth: Number(req.query.depth) || 3,
      maxEdges: Number(req.query.maxEdges) || 200,
      relFilter: req.query.rel || "",
    });
    return res.json({ success: true, data: n });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "graph_failed" });
  }
});

router.post("/api/agent-intel/v31/graph/seed-demo", (req, res) => {
  try {
    if (!transportAuthorized(req)) {
      return res.status(401).json({ success: false, error: "transport_key_required_or_mismatch" });
    }
    const b = req.body && typeof req.body === "object" ? req.body : {};
    const cust = String(b.customerId || "demo-customer");
    const ord = String(b.orderId || "demo-order");
    const inv = String(b.invoiceId || "demo-invoice");
    const task = String(b.taskId || "demo-task");
    const cId = entityRegistry.makeEntityId("customer", cust);
    const oId = entityRegistry.makeEntityId("order", ord);
    const iId = entityRegistry.makeEntityId("invoice", inv);
    const tId = entityRegistry.makeEntityId("task", task);
    relationshipEngine.registerEntity({ id: cId, entityType: "customer", attrs: { label: cust } });
    relationshipEngine.registerEntity({ id: oId, entityType: "order", attrs: { label: ord } });
    relationshipEngine.registerEntity({ id: iId, entityType: "invoice", attrs: { label: inv } });
    relationshipEngine.registerEntity({ id: tId, entityType: "task", attrs: { label: task } });
    relationshipEngine.addRelationship({ fromId: cId, toId: oId, rel: "CUSTOMER_TO_ORDER" });
    relationshipEngine.addRelationship({ fromId: oId, toId: iId, rel: "ORDER_TO_INVOICE" });
    relationshipEngine.addRelationship({ fromId: oId, toId: tId, rel: "ORDER_TO_TASK" });
    return res.json({ success: true, data: { customer: cId, order: oId, invoice: iId, task: tId } });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "graph_seed_failed" });
  }
});

router.post("/api/agent-intel/v31/planning/recommend", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const goal = String(body.goal || body.text || "");
    const out = recommendationEngine.recommendFromGoal(goal);
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "planning_failed" });
  }
});

router.post("/api/agent-intel/v31/voice/route", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const phrase = String(body.phrase || body.text || "");
    const out = voiceIntentRouter.routeFromPhrase(phrase);
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "voice_route_failed" });
  }
});

router.get("/api/agent-intel/v31/rate-limit/template", (_req, res) => {
  try {
    const rl = safety.rateLimitCheck();
    return res.json({ success: true, data: { sample429: safety.standardizedRateLimitHttpBody(rl), live: rl } });
  } catch (_e) {
    return res.status(500).json({ success: false });
  }
});

module.exports = router;
