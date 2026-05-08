"use strict";

/**
 * Activation Runner — Cheeky OS Automation Loop
 *
 * Turns the system ON. Runs in the background, calls existing services.
 *
 * IRON LAWS:
 *   - Never run production without deposit (enforced by routing engine)
 *   - Never create duplicate jobs (enforced by routing engine)
 *   - Never send customer messages
 *   - Additive only — wraps existing services
 *
 * Usage: require("./activation.runner").start()
 *        Called once from server.js startup.
 */

const path = require("path");

// ─── Service refs (lazy-loaded so runner doesn't crash server if unavailable) ─
function getProductionService() {
  try { return require(path.join(__dirname, "..", "productionRouting", "routing.service")); } catch (_) { return null; }
}
function getPrisma() {
  try { return require(path.join(__dirname, "..", "src", "lib", "prisma")); } catch (_) { return null; }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const RUN_INTERVAL_MS = 10 * 60 * 1000;   // 10 minutes
const JEREMY = "Jeremy";
const DTG_DTF_METHODS = new Set(["DTG", "DTF"]);

// ─── State ────────────────────────────────────────────────────────────────────
let _intervalHandle = null;
let _lastRunAt = null;
let _lastRunResult = null;
let _runCount = 0;
let _started = false;

// ─── Auto-engine run ──────────────────────────────────────────────────────────
async function runEngineOnce(triggeredBy) {
  const svc = getProductionService();
  if (!svc || typeof svc.runProductionEngine !== "function") {
    console.warn("[activation] production routing service unavailable — skipping run");
    return { ok: false, reason: "Service unavailable" };
  }
  try {
    const result = await svc.runProductionEngine({ limit: 50, dryRun: false, requestedBy: triggeredBy || "activation-runner" });
    _lastRunAt = new Date().toISOString();
    _lastRunResult = {
      processed: result.processed,
      jobsCreated: result.jobsCreated,
      blocked: result.blocked,
      skipped: result.skipped,
    };
    _runCount++;
    if (result.jobsCreated > 0) {
      console.log(`[activation] engine run #${_runCount}: ${result.jobsCreated} jobs created, ${result.blocked} blocked`);
    }
    return result;
  } catch (err) {
    console.error("[activation] engine run failed:", err && err.message ? err.message : err);
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// ─── Priority engine ──────────────────────────────────────────────────────────

/**
 * Rank today's production jobs by urgency.
 * Priority:
 *   1. Paid + overdue
 *   2. Paid + due within 3 days
 *   3. Paid + ready (no due date)
 *   4. Everything else eligible
 *
 * @param {number} [topN=5]
 * @returns {Promise<{topJobs: object[], blockedJobs: object[], allJobs: object[]}>}
 */
async function getTodayPriorityJobs(topN) {
  const limit = topN || 5;
  const prisma = getPrisma();
  if (!prisma) return { topJobs: [], blockedJobs: [], allJobs: [] };

  const now = new Date();
  const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  let jobs = [];
  try {
    jobs = await prisma.job.findMany({
      where: {
        status: { notIn: ["DONE", "COMPLETED", "CANCELLED"] },
      },
      select: {
        id: true,
        status: true,
        productionType: true,
        assignedTo: true,
        routingNotes: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
            status: true,
            quantity: true,
            isRush: true,
            amountPaid: true,
            totalAmount: true,
            amountTotal: true,
            depositPaid: true,
            depositReceived: true,
            depositStatus: true,
            completedAt: true,
            productionTypeFinal: true,
          },
        },
        tasks: {
          where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
          select: { id: true, title: true, type: true, status: true, assignedTo: true },
          take: 5,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  } catch (err) {
    console.warn("[activation] priority jobs load failed:", err && err.message ? err.message : err);
    return { topJobs: [], blockedJobs: [], allJobs: [] };
  }

  const topJobs = [];
  const blockedJobs = [];
  const readyJobs = [];

  for (const job of jobs) {
    const order = job.order || {};
    const paid = Number(order.amountPaid || 0);
    const depositPaid = Boolean(order.depositPaid || order.depositReceived || paid > 0);
    const dueDate = order.completedAt ? new Date(order.completedAt) : null;

    if (!depositPaid && paid <= 0) {
      blockedJobs.push({
        jobId: job.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        method: job.productionType,
        status: "BLOCKED_NO_DEPOSIT",
        reason: "No payment verified",
        nextTasks: job.tasks,
      });
      continue;
    }

    // Determine urgency score
    let urgency = 3;            // base: paid + ready
    let urgencyLabel = "READY";

    if (dueDate) {
      if (dueDate < now) {
        urgency = 1;
        urgencyLabel = "OVERDUE";
      } else if (dueDate <= threeDays) {
        urgency = 2;
        urgencyLabel = "DUE_SOON";
      }
    }
    if (order.isRush) { urgency = Math.min(urgency, 1); urgencyLabel = urgencyLabel === "OVERDUE" ? "OVERDUE_RUSH" : "RUSH"; }

    readyJobs.push({
      jobId: job.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      method: job.productionType,
      assignedTo: job.assignedTo,
      status: job.status,
      quantity: order.quantity,
      isRush: order.isRush,
      amountPaid: paid,
      dueDate: dueDate ? dueDate.toISOString() : null,
      urgency,
      urgencyLabel,
      nextTasks: job.tasks,
    });
  }

  // Sort: urgency ASC (1=most urgent), then createdAt ASC
  readyJobs.sort((a, b) => a.urgency - b.urgency || new Date(a.createdAt) - new Date(b.createdAt));

  topJobs.push(...readyJobs.slice(0, limit));

  return { topJobs, blockedJobs, allJobs: readyJobs };
}

/**
 * Get Jeremy's current task list (DTG + DTF jobs only).
 * @returns {Promise<{tasks: object[], currentFocus: string, nextUp: object[]}>}
 */
async function getJeremyView() {
  const prisma = getPrisma();
  if (!prisma) return { tasks: [], currentFocus: "Database unavailable.", nextUp: [] };

  let tasks = [];
  try {
    tasks = await prisma.task.findMany({
      where: {
        assignedTo: JEREMY,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        dueDate: true,
        jobId: true,
        orderId: true,
        job: {
          select: {
            id: true,
            productionType: true,
            status: true,
            order: {
              select: { orderNumber: true, customerName: true, quantity: true, isRush: true, completedAt: true, amountPaid: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
  } catch (_) {}

  // Filter to DTG/DTF only
  const dtgDtfTasks = tasks.filter((t) => {
    const method = String((t.job && t.job.productionType) || "").toUpperCase();
    return DTG_DTF_METHODS.has(method) || !method; // include untyped (might be unrouted)
  });

  // Also query jobs assigned to Jeremy
  let jeremyJobs = [];
  try {
    jeremyJobs = await prisma.job.findMany({
      where: {
        assignedTo: JEREMY,
        status: { notIn: ["DONE", "COMPLETED", "CANCELLED"] },
      },
      select: {
        id: true,
        status: true,
        productionType: true,
        order: { select: { orderNumber: true, customerName: true, quantity: true, isRush: true, completedAt: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ order: { isRush: "desc" } }, { createdAt: "asc" }],
      take: 10,
    });
  } catch (_) {}

  // Determine current focus (first IN_PROGRESS task, then first PENDING)
  const inProgress = dtgDtfTasks.find((t) => t.status === "IN_PROGRESS");
  const firstPending = dtgDtfTasks.find((t) => t.status === "PENDING");
  const focusTask = inProgress || firstPending;
  let currentFocus = "No active tasks. All clear!";
  if (focusTask) {
    const order = focusTask.job && focusTask.job.order;
    const orderLabel = order ? `Order #${order.orderNumber || focusTask.orderId} (${order.customerName})` : "";
    currentFocus = `${focusTask.title}${orderLabel ? " — " + orderLabel : ""}`;
  }

  const nextUp = dtgDtfTasks
    .filter((t) => t !== focusTask && t.status === "PENDING")
    .slice(0, 5)
    .map((t) => ({
      taskId: t.id,
      title: t.title,
      type: t.type,
      orderId: t.orderId,
      orderNumber: t.job && t.job.order && t.job.order.orderNumber,
      customerName: t.job && t.job.order && t.job.order.customerName,
      quantity: t.job && t.job.order && t.job.order.quantity,
    }));

  return {
    assignee: JEREMY,
    tasks: dtgDtfTasks.map((t) => ({
      taskId: t.id,
      title: t.title,
      type: t.type,
      status: t.status,
      orderNumber: t.job && t.job.order && t.job.order.orderNumber,
      customerName: t.job && t.job.order && t.job.order.customerName,
      quantity: t.job && t.job.order && t.job.order.quantity,
      isRush: t.job && t.job.order && t.job.order.isRush,
      dueDate: t.dueDate,
    })),
    currentFocus,
    nextUp,
    jeremyJobs,
    openTaskCount: dtgDtfTasks.length,
  };
}

// ─── Auto-advance task status ─────────────────────────────────────────────────

/**
 * Safe task status advancement.
 * If ALL tasks for a job are DONE, advances job status to DONE.
 * NEVER completes orders. NEVER sends messages.
 *
 * @param {string} taskId
 * @param {string} newStatus - PENDING | IN_PROGRESS | DONE
 * @param {string} [requestedBy]
 * @returns {Promise<object>}
 */
async function advanceTaskStatus(taskId, newStatus, requestedBy) {
  const ALLOWED_STATUSES = ["PENDING", "IN_PROGRESS", "DONE"];
  if (!ALLOWED_STATUSES.includes(String(newStatus || "").toUpperCase())) {
    return { ok: false, error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}` };
  }

  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "Database unavailable." };

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true, jobId: true, title: true },
    });
    if (!task) return { ok: false, error: `Task ${taskId} not found.` };

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus, updatedAt: new Date() },
      select: { id: true, title: true, status: true, jobId: true },
    });

    // Check if all tasks for this job are now DONE — if so, advance job status
    let jobAdvanced = false;
    if (newStatus === "DONE" && task.jobId) {
      const remaining = await prisma.task.count({
        where: { jobId: task.jobId, status: { notIn: ["DONE"] } },
      });
      if (remaining === 0) {
        await prisma.job.update({
          where: { id: task.jobId },
          data: { status: "QC", updatedAt: new Date() },
        });
        jobAdvanced = true;
      }
    }

    return { ok: true, task: updated, jobAdvanced, jobStatus: jobAdvanced ? "QC" : undefined };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

// ─── Status ───────────────────────────────────────────────────────────────────
function getRunnerStatus() {
  return {
    started: _started,
    runIntervalMinutes: RUN_INTERVAL_MS / 60000,
    runCount: _runCount,
    lastRunAt: _lastRunAt,
    lastRunResult: _lastRunResult,
  };
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────

function start() {
  if (_started) {
    console.log("[activation] runner already started — skipping duplicate start");
    return;
  }
  _started = true;

  // Fire one initial run (non-blocking) after a 5s startup grace period
  setTimeout(async () => {
    console.log("[activation] initial engine run starting...");
    await runEngineOnce("activation-startup");
  }, 5000);

  _intervalHandle = setInterval(async () => {
    try {
      const obs = require(path.join(__dirname, "..", "cheeky-os", "services", "cheekyOsRuntimeObservability.service"));
      obs.noteCronRun("activation_production_engine");
    } catch (_n) {}
    await runEngineOnce("activation-cron");
  }, RUN_INTERVAL_MS);

  console.log(`[activation] runner started — engine will run every ${RUN_INTERVAL_MS / 60000} minutes`);
}

function stop() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
  _started = false;
  console.log("[activation] runner stopped");
}

module.exports = {
  start,
  stop,
  runEngineOnce,
  getTodayPriorityJobs,
  getJeremyView,
  advanceTaskStatus,
  getRunnerStatus,
};
