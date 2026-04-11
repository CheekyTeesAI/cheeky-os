"use strict";

const { ensureDataFiles, readJson, writeJson } = require("./dataStore");
const { logEvent } = require("./eventStore");

/** @type {Array<Record<string, unknown>>} */
let tasks = [];

function persist() {
  try {
    writeJson("tasks.json", tasks);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[taskStore] persist:", e.message);
  }
}

/**
 * @param {Record<string, unknown>} raw
 */
function normalizeTask(raw) {
  const t = raw && typeof raw === "object" ? raw : {};
  const now = new Date().toISOString();
  const id = t.id != null ? String(t.id) : "";
  return {
    ...t,
    id,
    title: String(t.title != null ? t.title : ""),
    stage: String(t.stage != null ? t.stage : "INTAKE"),
    status: String(t.status != null ? t.status : "pending"),
    owner: String(t.owner != null ? t.owner : "unassigned"),
    role: String(t.role != null ? t.role : "general"),
    priority: String(t.priority != null ? t.priority : "normal"),
    createdAt: String(t.createdAt != null ? t.createdAt : now),
    updatedAt: String(t.updatedAt != null ? t.updatedAt : t.createdAt != null ? t.createdAt : now),
  };
}

function loadFromDisk() {
  ensureDataFiles();
  const loaded = readJson("tasks.json", []);
  if (!Array.isArray(loaded)) {
    tasks = [];
    persist();
    return;
  }
  tasks = loaded.map(normalizeTask);
}

loadFromDisk();

/**
 * @param {Record<string, unknown>} task
 */
function createTask(task) {
  const now = new Date().toISOString();
  const newTask = normalizeTask({
    status: "pending",
    createdAt: now,
    updatedAt: now,
    owner: task.owner || "unassigned",
    role: task.role || "general",
    priority: task.priority || "normal",
    ...task,
    id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8),
  });
  tasks.push(newTask);
  persist();
  try {
    logEvent("task_created", {
      taskId: newTask.id,
      title: newTask.title,
      stage: newTask.stage,
    });
  } catch (_) {}
  console.log("✅ task created:", newTask.id, newTask.stage);
  setImmediate(function () {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sendTaskNotification } = require("./notifyEngine");
      sendTaskNotification(newTask, "created").catch(function () {});
    } catch (_) {}
  });
  return newTask;
}

function getTasks() {
  return tasks.map(function (t) {
    return { ...t };
  });
}

/**
 * @param {string} id
 * @param {string} stage
 */
function updateTaskStage(id, stage) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  const priorStage = String(task.stage || "");
  task.stage = stage;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { assignOwner, assignPriority } = require("./taskEngine");
  Object.assign(task, assignOwner(stage));
  task.priority = assignPriority(stage);
  task.updatedAt = new Date().toISOString();
  persist();
  try {
    logEvent("task_stage_updated", {
      taskId: id,
      priorStage,
      stage,
    });
  } catch (_) {}
  console.log("🔄 task moved:", id, priorStage, "→", stage);
  if (stage === "COMPLETE" && priorStage !== "COMPLETE") {
    setImmediate(function () {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { sendTaskNotification } = require("./notifyEngine");
        sendTaskNotification(task, "moved").catch(function () {});
      } catch (_) {}
    });
  }
  return normalizeTask(task);
}

/**
 * @param {string} id
 * @param {string} owner
 */
function updateTaskOwner(id, owner) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  task.owner = String(owner || "unassigned");
  task.updatedAt = new Date().toISOString();
  persist();
  try {
    logEvent("task_owner_updated", { taskId: id, owner: task.owner });
  } catch (_) {}
  console.log("👤 owner updated:", id, task.owner);
  return normalizeTask(task);
}

/**
 * @param {string} id
 * @param {string} priority
 */
function updateTaskPriority(id, priority) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  task.priority = String(priority || "normal");
  task.updatedAt = new Date().toISOString();
  persist();
  try {
    logEvent("task_priority_updated", {
      taskId: id,
      priority: task.priority,
    });
  } catch (_) {}
  return normalizeTask(task);
}

/**
 * @param {string} id
 */
function completeTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return null;
  const already =
    String(task.stage || "") === "COMPLETE" ||
    String(task.status || "") === "completed";
  if (already) {
    return normalizeTask(task);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { assignOwner, assignPriority } = require("./taskEngine");
  task.status = "completed";
  task.stage = "COMPLETE";
  Object.assign(task, assignOwner("COMPLETE"));
  task.priority = assignPriority("COMPLETE");
  task.updatedAt = new Date().toISOString();
  persist();
  try {
    logEvent("task_completed", { taskId: id, title: task.title });
  } catch (_) {}
  console.log("✅ task completed:", id);
  setImmediate(function () {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sendTaskNotification } = require("./notifyEngine");
      sendTaskNotification(task, "moved").catch(function () {});
    } catch (_) {}
  });
  return normalizeTask(task);
}

/**
 * @returns {Record<string, unknown>}
 */
function getTaskMetrics() {
  const { getStuckTasks } = require("./stuckMonitor");
  const list = getTasks();
  const byStage = {
    INTAKE: 0,
    ART: 0,
    PRINT: 0,
    QC: 0,
    COMPLETE: 0,
  };
  /** @type {Record<string, number>} */
  const byOwner = {};
  let highPriorityCount = 0;
  let overdueCount = 0;
  const now = Date.now();
  const overdueMs = 48 * 60 * 60 * 1000;

  for (const t of list) {
    const st = String(t.stage || "");
    if (Object.prototype.hasOwnProperty.call(byStage, st)) {
      byStage[st]++;
    }

    const ow = String(t.owner || "unassigned");
    byOwner[ow] = (byOwner[ow] || 0) + 1;

    if (String(t.priority || "") === "high") highPriorityCount++;

    const done = st === "COMPLETE" || String(t.status || "") === "completed";
    if (!done) {
      const u = new Date(String(t.updatedAt || t.createdAt || "")).getTime();
      if (!Number.isNaN(u) && now - u > overdueMs) overdueCount++;
    }
  }

  const stuck = getStuckTasks(list);
  let cash = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cash = require("./followUpEngine").getCashMetrics();
  } catch (_) {
    cash = {
      totalEstimates: 0,
      openEstimates: 0,
      followUpsDue: 0,
      estimatedRevenue: 0,
      pipelineValue: 0,
    };
  }
  return {
    total: list.length,
    byStage,
    byOwner,
    overdueCount,
    highPriorityCount,
    stuckCount: stuck.length,
    totalEstimates: cash.totalEstimates,
    openEstimates: cash.openEstimates,
    followUpsDue: cash.followUpsDue,
    estimatedRevenue: cash.estimatedRevenue,
    pipelineValue: cash.pipelineValue,
  };
}

module.exports = {
  createTask,
  getTasks,
  updateTaskStage,
  updateTaskOwner,
  updateTaskPriority,
  completeTask,
  getTaskMetrics,
};
