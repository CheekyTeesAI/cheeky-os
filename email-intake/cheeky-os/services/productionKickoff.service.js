"use strict";

/**
 * CHEEKY OS v1 — After deposit mirror (GATE_PASSED): ensure Prisma Job, generate
 * production tasks (taskGenerator), set initial board stage on Dataverse intake.
 *
 * Does NOT create money state — runs only after mirrorDepositToDataverse PATCH succeeds.
 *
 * Env:
 *   CHEEKY_CT_PRODUCTION_KICKOFF=false — skip entirely
 *   CHEEKY_CT_INITIAL_PRODUCTION_STAGE — default ART_PREP (ct_production_stage_code on intake)
 *   CHEEKY_CT_MIRROR_TASKS_TO_DV=true — optional POST ct_production_tasks (requires table + option sets)
 */

const path = require("path");
const { logger } = require("../utils/logger");
const dvStore = require("../data/dataverse-store");
const dvF = require("./dvPublisherColumns.service");

const INTAKE_ENTITY = () => dvF.intakeEntitySet();
const TASK_ENTITY = () =>
  (process.env.CHEEKY_CT_PRODUCTION_TASK_ENTITY_SET || "ct_production_tasks").trim();

function initialStageCode() {
  const s = String(
    process.env.CHEEKY_CT_INITIAL_PRODUCTION_STAGE || "DEPOSIT_PAID"
  ).trim();
  return s || "DEPOSIT_PAID";
}

function kickoffDisabled() {
  const raw = String(process.env.CHEEKY_CT_PRODUCTION_KICKOFF || "true").toLowerCase();
  return raw === "false" || raw === "0" || raw === "off";
}

function tryRequire(relDist) {
  try {
    return require(path.join(__dirname, "..", "..", relDist));
  } catch (e) {
    logger.warn("[productionKickoff] require failed " + relDist + ": " + (e.message || e));
    return null;
  }
}

function mapTaskStatusToDv(s) {
  const u = String(s || "").toUpperCase();
  if (u === "DONE") return "DONE";
  if (u === "BLOCKED") return "BLOCKED";
  if (u === "IN_PROGRESS") return "IN_PROGRESS";
  if (u === "SKIPPED") return "SKIPPED";
  return "PENDING";
}

/**
 * @param {{ orderId: string, dataverseIntakeId: string }} opts
 */
async function runProductionKickoffAfterMirror(opts) {
  if (kickoffDisabled()) {
    return { ok: true, skipped: true, reason: "CHEEKY_CT_PRODUCTION_KICKOFF off" };
  }
  const orderId = opts && opts.orderId;
  const dataverseIntakeId = opts && opts.dataverseIntakeId;
  if (!orderId) return { ok: false, error: "missing_orderId" };

  const jobMod = tryRequire("dist/services/jobCreationService.js");
  if (jobMod && typeof jobMod.ensureJobShellForDepositedOrder === "function") {
    try {
      await jobMod.ensureJobShellForDepositedOrder(orderId);
    } catch (e) {
      logger.warn(
        "[productionKickoff] ensureJobShellForDepositedOrder: " + (e.message || e)
      );
    }
  }

  const taskGen = tryRequire("dist/services/taskGenerator.js");
  if (!taskGen || typeof taskGen.generateTasksForOrder !== "function") {
    logger.warn("[productionKickoff] dist/taskGenerator missing — run npm run build");
    return { ok: false, error: "no_task_generator" };
  }

  try {
    await taskGen.generateTasksForOrder(orderId);
  } catch (e) {
    logger.warn("[productionKickoff] generateTasksForOrder: " + (e.message || e));
    return { ok: false, error: String(e.message || e) };
  }

  if (dvStore.isConfigured() && dataverseIntakeId) {
    const stage = initialStageCode();
    const patch = { [dvF.intakeField("production_stage_code")]: stage };
    const pres = await dvStore.odataRequest(
      "PATCH",
      `${INTAKE_ENTITY()}(${dataverseIntakeId})`,
      patch
    );
    if (!pres.ok) {
      logger.warn("[productionKickoff] stage PATCH: " + (pres.error || "failed"));
    }

    const mirrorDv = String(process.env.CHEEKY_CT_MIRROR_TASKS_TO_DV || "")
      .trim()
      .toLowerCase();
    if (mirrorDv === "true" || mirrorDv === "1" || mirrorDv === "on") {
      await syncPrismaTasksToDataverse(orderId, dataverseIntakeId).catch((e) =>
        logger.warn("[productionKickoff] DV task sync: " + (e.message || e))
      );
    }
  }

  logger.info("[productionKickoff] ok orderId=" + orderId);
  return { ok: true, orderId };
}

async function syncPrismaTasksToDataverse(orderId, dataverseIntakeId) {
  const prismaMod = tryRequire("dist/lib/prisma.js");
  if (!prismaMod || !prismaMod.default) return;
  const db = prismaMod.default;
  const tasks = await db.task.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
  });
  const bindKey = `${INTAKE_ENTITY()}(${dataverseIntakeId})`;
  let sort = 0;
  for (const t of tasks) {
    const filter = `${TASK_ENTITY()}?$filter=ct_prisma_task_id eq '${String(t.id).replace(/'/g, "''")}'`;
    const existing = await dvStore.odataRequest("GET", filter);
    const has =
      existing &&
      existing.ok &&
      existing.data &&
      Array.isArray(existing.data.value) &&
      existing.data.value.length > 0;
    if (has) continue;

    const body = {
      ct_title: t.title || "Task",
      ct_type_code: t.type || "OPS",
      ct_status: mapTaskStatusToDv(t.status),
      ct_sort_order: sort++,
      ct_prisma_task_id: t.id,
      "ct_intake_queueid@odata.bind": "/" + bindKey,
    };
    const res = await dvStore.odataRequest("POST", TASK_ENTITY(), body);
    if (!res.ok) {
      logger.warn(
        "[productionKickoff] POST " + TASK_ENTITY() + " failed: " + (res.error || "")
      );
    }
  }
}

module.exports = {
  runProductionKickoffAfterMirror,
  initialStageCode,
};
