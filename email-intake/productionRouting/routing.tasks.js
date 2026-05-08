"use strict";

/**
 * Production Routing — Task Generation
 * Creates Prisma Task records for a job based on production method.
 * Uses getTasksForMethod from routing.rules.
 *
 * IRON LAW: No task generation without a valid jobId.
 */

const path = require("path");
const { getTasksForMethod } = require("./routing.rules");
const { writeRoutingAudit } = require("./routing.audit");

function getPrisma() {
  try { return require(path.join(__dirname, "..", "src", "lib", "prisma")); } catch (_) { return null; }
}

/**
 * Generate tasks for a production job.
 * Skips if tasks already exist (idempotent).
 *
 * @param {string} jobId
 * @param {string} orderId
 * @param {string} method - Production method (DTG, DTF, SCREEN, etc.)
 * @param {string} [assignedTo] - Default assignee for all tasks
 * @returns {Promise<{ok: boolean, created: number, skipped: number, tasks: object[]}>}
 */
async function generateTasksForJob(jobId, orderId, method, assignedTo) {
  if (!jobId) return { ok: false, error: "jobId required" };

  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "Database unavailable." };

  // Check existing tasks (idempotency)
  let existingCount = 0;
  try {
    existingCount = await prisma.task.count({ where: { jobId } });
  } catch (_) {}

  if (existingCount > 0) {
    return { ok: true, skipped: existingCount, created: 0, tasks: [], idempotent: true };
  }

  const templates = getTasksForMethod(method);
  const created = [];

  for (const tmpl of templates) {
    try {
      const task = await prisma.task.create({
        data: {
          jobId,
          orderId: orderId || undefined,
          title: tmpl.title,
          type: tmpl.type,
          status: "PENDING",
          assignedTo: assignedTo || null,
          releaseStatus: "BLOCKED",
          orderReady: false,
          blanksOrdered: false,
          productionHold: true,
        },
        select: { id: true, title: true, type: true, status: true, assignedTo: true },
      });
      created.push(task);
    } catch (err) {
      console.warn("[routing/tasks] task create failed:", err && err.message ? err.message : err);
    }
  }

  await writeRoutingAudit({
    action: "TASKS_GENERATED",
    jobId,
    orderId,
    method,
    assignee: assignedTo,
    allowed: true,
    blocked: false,
    result: `Generated ${created.length}/${templates.length} tasks for ${method} job ${jobId}`,
  });

  return { ok: true, created: created.length, skipped: 0, tasks: created };
}

/**
 * Get all tasks for a job.
 * @param {string} jobId
 * @returns {Promise<object[]>}
 */
async function getJobTasks(jobId) {
  const prisma = getPrisma();
  if (!prisma) return [];
  try {
    return await prisma.task.findMany({
      where: { jobId },
      select: { id: true, title: true, type: true, status: true, assignedTo: true, dueDate: true, releaseStatus: true },
      orderBy: { createdAt: "asc" },
    });
  } catch (_) {
    return [];
  }
}

/**
 * Get all open/pending tasks.
 * @param {number} limit
 * @returns {Promise<object[]>}
 */
async function getOpenTasks(limit) {
  const prisma = getPrisma();
  if (!prisma) return [];
  try {
    return await prisma.task.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      select: {
        id: true, title: true, type: true, status: true, assignedTo: true,
        dueDate: true, jobId: true, orderId: true,
        order: { select: { customerName: true, status: true } },
      },
      orderBy: { createdAt: "asc" },
      take: Math.min(Number(limit) || 100, 500),
    });
  } catch (_) {
    return [];
  }
}

module.exports = { generateTasksForJob, getJobTasks, getOpenTasks };
