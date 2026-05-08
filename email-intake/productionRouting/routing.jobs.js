"use strict";

/**
 * Production Routing — Job Creation
 *
 * REUSE FIRST: wraps existing dist/services/jobCreationService.createJobForDepositedOrder
 * Adds Square Sync payment gate + routing rule integration.
 *
 * IRON LAWS:
 *   - No deposit = no job
 *   - No duplicate jobs
 *   - No auto-send
 */

const path = require("path");
const { checkProductionEligibility, determineProductionRoute } = require("./routing.rules");
const { writeRoutingAudit } = require("./routing.audit");

function getPrisma() {
  try { return require(path.join(__dirname, "..", "src", "lib", "prisma")); } catch (_) { return null; }
}

/**
 * Load existing job creation service from dist (compiled).
 * Returns null if unavailable (graceful degradation).
 */
function getExistingJobService() {
  try {
    return require(path.join(__dirname, "..", "dist", "services", "jobCreationService"));
  } catch (_) {
    return null;
  }
}

/**
 * Load existing production routing service from dist.
 */
function getExistingRoutingService() {
  try {
    return require(path.join(__dirname, "..", "dist", "services", "productionRoutingService"));
  } catch (_) {
    return null;
  }
}

/**
 * Create a production job for a single order.
 * Enforces payment gate, checks for existing jobs, routes if new.
 *
 * @param {object} order - Full Prisma Order row
 * @param {object} [options]
 * @param {boolean} [options.forceReroute] - Override existing routing (manual override)
 * @param {string} [options.requestedBy]
 * @returns {Promise<object>}
 */
async function createProductionJob(order, options) {
  const requestedBy = (options && options.requestedBy) || "production-routing-engine";
  const forceReroute = Boolean(options && options.forceReroute);

  // ── 1. Payment gate (IRON LAW) ────────────────────────────────────────────
  const eligibility = checkProductionEligibility(order);
  if (!eligibility.eligible) {
    await writeRoutingAudit({
      action: "CREATE_JOB_BLOCKED",
      orderId: order.id,
      allowed: false,
      blocked: true,
      reason: eligibility.reason,
      result: "Blocked — no deposit",
    });
    return {
      ok: false,
      blocked: true,
      reason: eligibility.reason,
      orderId: order.id,
    };
  }

  const prisma = getPrisma();

  // ── 2. Check for existing Job (idempotency) ───────────────────────────────
  if (prisma) {
    try {
      const existingJob = await prisma.job.findUnique({ where: { orderId: order.id } });
      if (existingJob && !forceReroute) {
        // Job already exists — ensure routing is current
        try {
          const routingSvc = getExistingRoutingService();
          if (routingSvc && typeof routingSvc.routeProductionForOrder === "function") {
            await routingSvc.routeProductionForOrder(order.id);
          }
        } catch (_) {}

        await writeRoutingAudit({
          action: "JOB_ALREADY_EXISTS",
          orderId: order.id,
          jobId: existingJob.id,
          allowed: true,
          blocked: false,
          result: `Job already exists: ${existingJob.id}`,
        });

        return {
          ok: true,
          idempotent: true,
          jobId: existingJob.id,
          orderId: order.id,
          status: existingJob.status,
          message: "Job already exists.",
        };
      }
    } catch (err) {
      console.warn("[routing/jobs] existing job check failed:", err && err.message ? err.message : err);
    }
  }

  // ── 3. Determine routing ─────────────────────────────────────────────────
  const route = determineProductionRoute(order);

  // ── 4. Try existing job creation service first ───────────────────────────
  let jobId = null;
  let createdViaExisting = false;
  const existingSvc = getExistingJobService();

  if (existingSvc && typeof existingSvc.createJobForDepositedOrder === "function") {
    try {
      const result = await existingSvc.createJobForDepositedOrder(order.id);
      if (result && result.job) {
        jobId = result.job.id;
        createdViaExisting = true;
      }
    } catch (existingErr) {
      const msg = existingErr && existingErr.message ? existingErr.message : String(existingErr);
      // Some expected errors (order already has a job) — these are OK
      if (msg.includes("already") || msg.includes("exists") || msg.includes("not eligible")) {
        console.warn("[routing/jobs] existing service reported:", msg);
      } else {
        console.warn("[routing/jobs] existing service error:", msg);
      }
    }
  }

  // ── 5. Fallback: create Job directly via Prisma ───────────────────────────
  if (!jobId && prisma) {
    try {
      const newJob = await prisma.job.create({
        data: {
          orderId: order.id,
          status: "READY",
          productionType: route.method,
          assignedTo: route.assignee,
          notes: `Created by Production Routing Engine — ${new Date().toISOString()}`,
          routingNotes: route.reason,
        },
      });
      jobId = newJob.id;

      // Mark order as job created
      await prisma.order.update({
        where: { id: order.id },
        data: {
          jobCreated: true,
          jobCreatedAt: new Date(),
          productionTypeFinal: route.method,
          assignedProductionTo: route.assignee,
          routingStatus: "ROUTED",
          routedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (createErr) {
      const msg = createErr && createErr.message ? createErr.message : String(createErr);
      await writeRoutingAudit({
        action: "JOB_CREATE_ERROR",
        orderId: order.id,
        allowed: false,
        blocked: false,
        reason: msg,
        result: "Failed to create job",
        error: msg,
      });
      return { ok: false, error: msg, orderId: order.id };
    }
  }

  if (!jobId) {
    return { ok: false, error: "Job creation failed (no DB available).", orderId: order.id };
  }

  await writeRoutingAudit({
    action: "JOB_CREATED",
    orderId: order.id,
    jobId,
    method: route.method,
    assignee: route.assignee,
    allowed: true,
    blocked: false,
    reason: route.reason,
    result: createdViaExisting
      ? `Job created via existing service: ${jobId}`
      : `Job created directly: ${jobId}`,
  });

  return {
    ok: true,
    created: true,
    jobId,
    orderId: order.id,
    method: route.method,
    assignee: route.assignee,
    reason: route.reason,
    confidence: route.confidence,
    outsource: route.outsource,
  };
}

module.exports = { createProductionJob };
