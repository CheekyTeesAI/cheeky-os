/**
 * Task lifecycle — updates team store + job execution fields in JSON store.
 */
const { getAssignment, upsertAssignments, getAssignments, setJobFlag, recordCompletedToday } = require("./teamTaskStore");
const { updateJob, getJobById } = require("../data/store");
const { advanceJobs } = require("./productionFlowEngine");

function patchTask(taskId, updates) {
  const a = getAssignment(taskId);
  if (!a) return null;
  const next = { ...a, ...updates, updatedAt: new Date().toISOString() };
  upsertAssignments([next]);
  return next;
}

async function startTask(taskId) {
  const cur = getAssignment(taskId);
  if (!cur) return { success: false, error: "task_not_found" };
  if (String(cur.status).toUpperCase() === "BLOCKED") {
    return { success: false, error: "task_blocked", reason: cur.blockedReason };
  }
  const row = patchTask(taskId, {
    status: "IN_PROGRESS",
    startedAt: new Date().toISOString(),
  });
  const jobId = row.jobId;
  try {
    updateJob(jobId, {
      teamExecutionPhase: "PRINTING",
      teamExecutionUpdatedAt: new Date().toISOString(),
    });
  } catch (_e) {
    /* ignore */
  }
  await advanceJobs();
  return { success: true, task: row };
}

async function completeTask(taskId) {
  const cur = getAssignment(taskId);
  if (!cur) return { success: false, error: "task_not_found" };
  const row = patchTask(taskId, {
    status: "COMPLETED",
    completedAt: new Date().toISOString(),
    blockedReason: null,
  });
  recordCompletedToday(taskId, row.jobId);
  await advanceJobs();
  return { success: true, task: row };
}

function blockTask(taskId, reason) {
  const cur = getAssignment(taskId);
  if (!cur) return { success: false, error: "task_not_found" };
  const row = patchTask(taskId, {
    status: "BLOCKED",
    blockedReason: String(reason || "").slice(0, 500),
  });
  const jobId = row.jobId;
  try {
    updateJob(jobId, {
      teamExecutionBlocked: true,
      teamExecutionBlockNote: String(reason || "").slice(0, 500),
      teamExecutionUpdatedAt: new Date().toISOString(),
    });
  } catch (_e) {
    /* ignore */
  }
  return { success: true, task: row };
}

function reassignTask(taskId, userId) {
  const cur = getAssignment(taskId);
  if (!cur) return { success: false, error: "task_not_found" };
  const row = patchTask(taskId, { assignedTo: String(userId || "").toLowerCase(), reassignedAt: new Date().toISOString() });
  return { success: true, task: row };
}

module.exports = {
  startTask,
  completeTask,
  blockTask,
  reassignTask,
};
