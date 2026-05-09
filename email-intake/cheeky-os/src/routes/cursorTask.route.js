"use strict";

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const chatgptAuth = require(path.join(__dirname, "..", "..", "..", "..", "src", "services", "chatgptActionAuth"));

const router = express.Router();

const DATA_FILE = path.join(__dirname, "..", "..", "..", "data", "cursor-tasks.json");

const PRIORITY_RANK = {
  critical: 0,
  urgent: 1,
  p0: 0,
  p1: 1,
  high: 2,
  medium: 3,
  normal: 3,
  default: 3,
  low: 4,
  p2: 4,
  backlog: 5,
};

function priorityRank(p) {
  const k = String(p || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PRIORITY_RANK, k)) return PRIORITY_RANK[k];
  const n = Number(k);
  if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  return 50;
}

function readStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const j = JSON.parse(raw);
    if (!j || typeof j !== "object") return { tasks: [] };
    if (!Array.isArray(j.tasks)) j.tasks = [];
    return j;
  } catch (_) {
    return { tasks: [] };
  }
}

function writeStore(obj) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf8");
}

router.post("/api/cursor/task", chatgptAuth.requireChatGPTActionAuth, (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const task = body.task != null ? String(body.task).trim() : "";
  const context = body.context != null ? String(body.context) : "";
  const priority = body.priority != null ? String(body.priority).trim() : "normal";

  if (!task) {
    return res.status(400).json({
      success: false,
      error: "task is required (non-empty string)",
      timestamp: new Date().toISOString(),
    });
  }

  const store = readStore();
  const item = {
    id: crypto.randomUUID(),
    task,
    context,
    priority,
    priorityRank: priorityRank(priority),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  store.tasks.push(item);
  store.updatedAt = new Date().toISOString();
  writeStore(store);

  return res.status(201).json({
    success: true,
    task: item,
    timestamp: new Date().toISOString(),
  });
});

router.get("/api/cursor/task/next", chatgptAuth.requireChatGPTActionAuth, (_req, res) => {
  const store = readStore();
  const pending = store.tasks.filter((t) => t && t.status === "pending");
  if (pending.length === 0) {
    return res.json({
      success: true,
      task: null,
      message: "no pending tasks",
      timestamp: new Date().toISOString(),
    });
  }

  pending.sort((a, b) => {
    const ra = typeof a.priorityRank === "number" ? a.priorityRank : priorityRank(a.priority);
    const rb = typeof b.priorityRank === "number" ? b.priorityRank : priorityRank(b.priority);
    if (ra !== rb) return ra - rb;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });

  const next = pending[0];
  const idx = store.tasks.findIndex((t) => t && t.id === next.id);
  if (idx === -1) {
    return res.status(500).json({
      success: false,
      error: "queue inconsistent",
      timestamp: new Date().toISOString(),
    });
  }

  const [removed] = store.tasks.splice(idx, 1);
  removed.status = "claimed";
  removed.claimedAt = new Date().toISOString();
  store.updatedAt = new Date().toISOString();
  writeStore(store);

  return res.json({
    success: true,
    task: removed,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
