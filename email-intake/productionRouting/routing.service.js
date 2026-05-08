"use strict";

/**
 * Production Routing — Core Service
 *
 * The "WHAT DO WE PRINT NEXT?" engine.
 *
 * Orchestrates:
 *   1. Payment gate (Square Sync)
 *   2. Route determination (DTG/DTF/SCREEN/VENDOR)
 *   3. Job creation (wraps existing jobCreationService)
 *   4. Task generation
 *   5. Queue view
 *   6. Assignment
 *   7. Operator Bridge context
 *
 * IRON LAWS:
 *   - No deposit = no production (ever)
 *   - No auto-send
 *   - Additive only
 *   - Fail closed
 */

const path = require("path");
const { determineProductionRoute, checkProductionEligibility, ASSIGNEES } = require("./routing.rules");
const { createProductionJob } = require("./routing.jobs");
const { generateTasksForJob, getJobTasks, getOpenTasks } = require("./routing.tasks");
const { writeRoutingAudit, readRoutingAudit } = require("./routing.audit");

// ─── Prisma helper ────────────────────────────────────────────────────────────
function getPrisma() {
  try { return require(path.join(__dirname, "..", "src", "lib", "prisma")); } catch (_) { return null; }
}

async function safeCall(label, fn, fallback) {
  try { return await fn(); } catch (err) {
    console.warn(`[routing/service] ${label}:`, err && err.message ? err.message : err);
    return fallback;
  }
}

// ─── Eligible order stages ────────────────────────────────────────────────────
// Orders in these stages (or with deposit) can have jobs created
const ELIGIBLE_STATUSES = new Set([
  "DEPOSIT", "DEPOSIT_PAID", "READY", "APPROVED", "CONFIRMED",
  "PRODUCTION_READY", "INTAKE", "QUOTE_APPROVED",
]);

const EXCLUDED_STATUSES = new Set([
  "DONE", "COMPLETE", "COMPLETED", "CANCELLED", "CANCELED",
  "ARCHIVED", "LOST", "REFUNDED",
]);

// ─── Run Engine ───────────────────────────────────────────────────────────────

/**
 * Run the production routing engine against all eligible orders.
 * Creates jobs + tasks for orders with verified deposits.
 *
 * @param {object} [options]
 * @param {number} [options.limit] - Max orders to process (default 50)
 * @param {boolean} [options.dryRun] - If true, determine routes without writing
 * @param {string} [options.requestedBy]
 * @returns {Promise<object>}
 */
async function runProductionEngine(options) {
  const limit = Math.min(Number((options && options.limit) || 50), 200);
  const dryRun = Boolean(options && options.dryRun);
  const requestedBy = (options && options.requestedBy) || "operator";

  const prisma = getPrisma();
  const warnings = [];

  if (!prisma) {
    return {
      ok: false,
      error: "Database unavailable.",
      processed: 0,
      jobsCreated: 0,
      skipped: 0,
      blocked: 0,
    };
  }

  // Load all non-complete, non-cancelled orders
  let orders = [];
  try {
    orders = await prisma.order.findMany({
      where: {
        deletedAt: null,
        status: { notIn: Array.from(EXCLUDED_STATUSES) },
        jobCreated: { not: true },  // Only orders without jobs yet
      },
      select: {
        id: true,
        customerName: true,
        status: true,
        printMethod: true,
        garmentType: true,
        quantity: true,
        isRush: true,
        notes: true,
        amountPaid: true,
        totalAmount: true,
        amountTotal: true,
        depositPaid: true,
        depositReceived: true,
        depositStatus: true,
        squarePaymentStatus: true,
        productionTypeFinal: true,
        assignedProductionTo: true,
        jobCreated: true,
        routingStatus: true,
        completedAt: true,
        updatedAt: true,
      },
      orderBy: [
        { isRush: "desc" },
        { updatedAt: "asc" },
      ],
      take: limit,
    });
  } catch (err) {
    warnings.push(`Orders load failed: ${err && err.message ? err.message : err}`);
  }

  const results = {
    ok: true,
    dryRun,
    processed: 0,
    jobsCreated: 0,
    tasksCreated: 0,
    skipped: 0,
    blocked: 0,
    warnings,
    jobs: [],
  };

  for (const order of orders) {
    results.processed++;

    // Skip excluded statuses
    if (EXCLUDED_STATUSES.has(String(order.status || "").toUpperCase())) {
      results.skipped++;
      continue;
    }

    // Payment eligibility gate
    const eligibility = checkProductionEligibility(order);
    if (!eligibility.eligible) {
      results.blocked++;
      results.jobs.push({
        orderId: order.id,
        customerName: order.customerName,
        status: "BLOCKED",
        reason: eligibility.reason,
        blocked: true,
      });
      continue;
    }

    // Determine route
    const route = determineProductionRoute(order);

    if (dryRun) {
      results.jobs.push({
        orderId: order.id,
        customerName: order.customerName,
        status: "WOULD_CREATE",
        method: route.method,
        assignee: route.assignee,
        reason: route.reason,
        confidence: route.confidence,
        dryRun: true,
      });
      continue;
    }

    // Create job
    const jobResult = await createProductionJob(order, { requestedBy });

    if (!jobResult.ok) {
      results.blocked++;
      results.jobs.push({
        orderId: order.id,
        customerName: order.customerName,
        status: "FAILED",
        error: jobResult.error || jobResult.reason,
      });
      continue;
    }

    if (jobResult.idempotent) {
      results.skipped++;
      results.jobs.push({
        orderId: order.id,
        jobId: jobResult.jobId,
        status: "EXISTING",
        message: "Job already exists.",
      });
      continue;
    }

    // Generate tasks
    const taskResult = await generateTasksForJob(
      jobResult.jobId,
      order.id,
      route.method,
      route.assignee
    );

    results.jobsCreated++;
    results.tasksCreated += (taskResult.created || 0);

    results.jobs.push({
      orderId: order.id,
      customerName: order.customerName,
      jobId: jobResult.jobId,
      status: "CREATED",
      method: route.method,
      assignee: route.assignee,
      tasksCreated: taskResult.created || 0,
      confidence: route.confidence,
    });
  }

  await writeRoutingAudit({
    action: "ENGINE_RUN",
    allowed: true,
    blocked: false,
    result: `Engine run: processed=${results.processed}, created=${results.jobsCreated}, blocked=${results.blocked}, dryRun=${dryRun}`,
  });

  return results;
}

// ─── Queue View ───────────────────────────────────────────────────────────────

const QUEUE_STATUS_MAP = {
  ready: ["READY", "PRODUCTION_READY"],
  printing: ["PRINTING", "IN_PROGRESS", "ACTIVE"],
  qc: ["QC", "QC_CHECK"],
  pickup: ["DONE", "READY_FOR_PICKUP", "PICKUP"],
};

/**
 * Get the production queue grouped by stage.
 * @param {object} [options]
 * @param {number} [options.limit]
 * @returns {Promise<object>}
 */
async function getProductionQueue(options) {
  const limit = Math.min(Number((options && options.limit) || 100), 500);
  const prisma = getPrisma();

  if (!prisma) {
    return { ok: false, error: "Database unavailable.", ready: [], printing: [], qc: [], pickup: [] };
  }

  const allStatuses = Object.values(QUEUE_STATUS_MAP).flat();

  let jobs = [];
  try {
    jobs = await prisma.job.findMany({
      where: { status: { in: [...allStatuses, "READY", "BLOCKED", "PENDING"] } },
      select: {
        id: true,
        status: true,
        productionType: true,
        assignedTo: true,
        notes: true,
        routingNotes: true,
        createdAt: true,
        order: {
          select: {
            id: true,
            customerName: true,
            status: true,
            quantity: true,
            isRush: true,
            depositStatus: true,
            amountPaid: true,
            totalAmount: true,
            completedAt: true,
          },
        },
        tasks: {
          select: { id: true, title: true, status: true, type: true, assignedTo: true },
          orderBy: { createdAt: "asc" },
          take: 10,
        },
      },
      orderBy: [{ order: { isRush: "desc" } }, { createdAt: "asc" }],
      take: limit,
    });
  } catch (err) {
    return {
      ok: true,
      partial: true,
      warnings: [`Jobs load failed: ${err && err.message ? err.message : err}`],
      ready: [], printing: [], qc: [], pickup: [],
    };
  }

  const queue = { ready: [], printing: [], qc: [], pickup: [], blocked: [] };

  for (const job of jobs) {
    const statusUpper = String(job.status || "").toUpperCase();
    const entry = {
      jobId: job.id,
      orderId: job.order && job.order.id,
      customerName: job.order && job.order.customerName,
      method: job.productionType,
      assignee: job.assignedTo,
      status: job.status,
      quantity: job.order && job.order.quantity,
      isRush: job.order && job.order.isRush,
      depositStatus: job.order && job.order.depositStatus,
      amountPaid: job.order && job.order.amountPaid,
      dueDate: job.order && job.order.completedAt,
      tasks: job.tasks || [],
      tasksOpen: (job.tasks || []).filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length,
    };

    if (QUEUE_STATUS_MAP.ready.includes(statusUpper)) {
      queue.ready.push(entry);
    } else if (QUEUE_STATUS_MAP.printing.includes(statusUpper)) {
      queue.printing.push(entry);
    } else if (QUEUE_STATUS_MAP.qc.includes(statusUpper)) {
      queue.qc.push(entry);
    } else if (QUEUE_STATUS_MAP.pickup.includes(statusUpper)) {
      queue.pickup.push(entry);
    } else if (statusUpper === "BLOCKED") {
      queue.blocked.push(entry);
    } else {
      // READY by default if job exists and has verified deposit
      queue.ready.push(entry);
    }
  }

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    totals: {
      ready: queue.ready.length,
      printing: queue.printing.length,
      qc: queue.qc.length,
      pickup: queue.pickup.length,
      blocked: queue.blocked.length,
      total: jobs.length,
    },
    ...queue,
  };
}

// ─── Jobs List ────────────────────────────────────────────────────────────────

async function getProductionJobs(options) {
  const limit = Math.min(Number((options && options.limit) || 50), 200);
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "Database unavailable.", jobs: [] };

  try {
    const jobs = await prisma.job.findMany({
      select: {
        id: true,
        status: true,
        productionType: true,
        assignedTo: true,
        routingNotes: true,
        createdAt: true,
        order: { select: { id: true, customerName: true, status: true, quantity: true, isRush: true, amountPaid: true, depositStatus: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ order: { isRush: "desc" } }, { createdAt: "desc" }],
      take: limit,
    });
    return { ok: true, count: jobs.length, jobs };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err), jobs: [] };
  }
}

// ─── Assignment Engine ────────────────────────────────────────────────────────

/**
 * Assign a job to an operator.
 * DTG/DTF → Jeremy by default
 * Screen/Vendor → Bullseye
 * Supports manual override.
 *
 * @param {string} jobId
 * @param {string|null} [assignee] - If null, auto-assign based on method
 * @param {string} [requestedBy]
 * @returns {Promise<object>}
 */
async function assignJob(jobId, assignee, requestedBy) {
  if (!jobId) return { ok: false, error: "jobId required" };
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "Database unavailable." };

  try {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, productionType: true, assignedTo: true, orderId: true },
    });
    if (!job) return { ok: false, error: `Job ${jobId} not found.` };

    // Auto-assign if no assignee provided
    let finalAssignee = assignee;
    if (!finalAssignee) {
      const method = String(job.productionType || "").toUpperCase();
      if (method === "DTG" || method === "DTF") {
        finalAssignee = ASSIGNEES.JEREMY;
      } else if (method === "SCREEN" || method === "SCREEN_PRINT" || method === "EMB" || method === "EMBROIDERY") {
        finalAssignee = ASSIGNEES.BULLSEYE;
      } else if (method === "VENDOR") {
        finalAssignee = ASSIGNEES.OWNER;
      } else {
        finalAssignee = ASSIGNEES.JEREMY;
      }
    }

    await prisma.job.update({
      where: { id: jobId },
      data: { assignedTo: finalAssignee, updatedAt: new Date() },
    });

    // Also update tasks
    await prisma.task.updateMany({
      where: { jobId, assignedTo: null },
      data: { assignedTo: finalAssignee },
    });

    // Update order assignment field
    if (job.orderId) {
      await safeCall("assign-order-update", () =>
        prisma.order.update({
          where: { id: job.orderId },
          data: { assignedProductionTo: finalAssignee, updatedAt: new Date() },
        })
      , null);
    }

    await writeRoutingAudit({
      action: "JOB_ASSIGNED",
      jobId,
      orderId: job.orderId,
      assignee: finalAssignee,
      allowed: true,
      blocked: false,
      result: `Job ${jobId} assigned to ${finalAssignee}`,
    });

    return { ok: true, jobId, assignee: finalAssignee, method: job.productionType };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Auto-assign all unassigned jobs.
 * @param {string} [requestedBy]
 * @returns {Promise<object>}
 */
async function autoAssignJobs(requestedBy) {
  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "Database unavailable.", assigned: 0 };

  let unassigned = [];
  try {
    unassigned = await prisma.job.findMany({
      where: { assignedTo: null, status: { notIn: ["DONE", "COMPLETED", "CANCELLED"] } },
      select: { id: true, productionType: true, orderId: true },
      take: 100,
    });
  } catch (_) {}

  let assigned = 0;
  const results = [];
  for (const job of unassigned) {
    const res = await assignJob(job.id, null, requestedBy);
    if (res.ok) {
      assigned++;
      results.push({ jobId: job.id, assignee: res.assignee });
    }
  }

  return { ok: true, assigned, results };
}

// ─── Operator Bridge Context ──────────────────────────────────────────────────

/**
 * Build the production context block for /api/operator/context.
 * @returns {Promise<object>}
 */
async function buildOperatorContextProduction() {
  try {
    const prisma = getPrisma();
    if (!prisma) return { enabled: false, error: "Database unavailable." };

    const [jobsReady, jobsPrinting, jobsQC, jobsDone, jobsBlocked] = await Promise.all([
      safeCall("count-ready", () => prisma.job.count({ where: { status: { in: ["READY", "PRODUCTION_READY"] } } }), 0),
      safeCall("count-printing", () => prisma.job.count({ where: { status: { in: ["PRINTING", "IN_PROGRESS"] } } }), 0),
      safeCall("count-qc", () => prisma.job.count({ where: { status: "QC" } }), 0),
      safeCall("count-done", () => prisma.job.count({ where: { status: { in: ["DONE", "COMPLETED"] } } }), 0),
      safeCall("count-blocked", () => prisma.job.count({ where: { status: "BLOCKED" } }), 0),
    ]);

    const openTasks = await safeCall("open-tasks", () =>
      prisma.task.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } })
    , 0);

    const jeremyTasks = await safeCall("jeremy-tasks", () =>
      prisma.task.count({ where: { assignedTo: ASSIGNEES.JEREMY, status: { in: ["PENDING", "IN_PROGRESS"] } } })
    , 0);

    return {
      enabled: true,
      jobsReady,
      jobsPrinting,
      jobsQC,
      jobsDone,
      jobsBlocked,
      openTasks,
      jeremyOpenTasks: jeremyTasks,
    };
  } catch (err) {
    return { enabled: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  runProductionEngine,
  getProductionQueue,
  getProductionJobs,
  assignJob,
  autoAssignJobs,
  buildOperatorContextProduction,
  getJobTasks,
  getOpenTasks,
  readRoutingAudit,
};
