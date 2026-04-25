/**
 * Advances job execution phase from team task completion (store-backed).
 * Does not notify owner — silent state updates only.
 */
const { getJobs, updateJob } = require("../data/store");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { assignTasks } = require("./taskAssignmentEngine");
const { getAssignments, getJobFlag, upsertAssignments } = require("./teamTaskStore");

function norm(s) {
  return String(s || "").toUpperCase();
}

function tasksForJob(jobId, all) {
  return (all || []).filter((a) => a && a.jobId === jobId);
}

function allComplete(tasks) {
  if (!tasks.length) return false;
  return tasks.every((t) => norm(t.status) === "COMPLETED");
}

function anyInProgress(tasks) {
  return tasks.some((t) => norm(t.status) === "IN_PROGRESS");
}

function anyBlocked(tasks) {
  return tasks.some((t) => norm(t.status) === "BLOCKED");
}

function qcTasks(tasks) {
  return tasks.filter((t) => /qc/i.test(String(t.task || "")));
}

function nonQcTasks(tasks) {
  return tasks.filter((t) => !/qc/i.test(String(t.task || "")));
}

function nonQcComplete(tasks) {
  const nonQc = nonQcTasks(tasks);
  if (!nonQc.length) return true;
  return nonQc.every((t) => norm(t.status) === "COMPLETED");
}

function qcComplete(tasks) {
  const qTs = qcTasks(tasks);
  if (!qTs.length) return true;
  return qTs.every((t) => norm(t.status) === "COMPLETED");
}

/**
 * Silent comm prep — metadata only; no send (approval layer handles outbound).
 */
function setCommPrep(jobId, templateKey) {
  try {
    updateJob(jobId, {
      teamCommPrep: {
        templateKey,
        preparedAt: new Date().toISOString(),
        note: "Prepared by production flow — not sent",
      },
    });
  } catch (_e) {
    /* ignore */
  }
}

/**
 * Merge store jobs with foundation jobs by jobId for assignment coverage.
 */
async function mergeJobsForExecution() {
  let merged = [];
  try {
    merged = await getOperatingSystemJobs();
  } catch (_e) {
    merged = getJobs();
  }
  const byId = new Map();
  for (const j of merged) {
    if (j && j.jobId) byId.set(j.jobId, j);
  }
  for (const j of getJobs()) {
    if (j && j.jobId && !byId.has(j.jobId)) byId.set(j.jobId, j);
  }
  return Array.from(byId.values());
}

async function advanceJobs() {
  const jobs = await mergeJobsForExecution();
  assignTasks(jobs);

  const all = getAssignments();
  const processed = [];

  for (const job of jobs) {
    if (!job || !job.jobId) continue;
    const flags = getJobFlag(job.jobId);
    if (flags.paused) {
      processed.push({ jobId: job.jobId, skipped: true, reason: "paused" });
      continue;
    }

    const tasks = tasksForJob(job.jobId, all);
    if (!tasks.length) continue;

    let phase = job.teamExecutionPhase || null;

    if (anyBlocked(tasks)) {
      phase = "BLOCKED";
    } else if (allComplete(tasks)) {
      phase = "COMPLETE";
      setCommPrep(job.jobId, "READY_FOR_PICKUP");
      try {
        updateJob(job.jobId, {
          teamExecutionPhase: "COMPLETE",
          teamPickupReady: true,
          teamExecutionUpdatedAt: new Date().toISOString(),
        });
      } catch (_e) {
        /* ignore */
      }
    } else if (qcTasks(tasks).length > 0 && nonQcComplete(tasks) && !qcComplete(tasks)) {
      phase = "QC";
      try {
        updateJob(job.jobId, {
          teamExecutionPhase: "QC",
          teamExecutionUpdatedAt: new Date().toISOString(),
        });
      } catch (_e) {
        /* ignore */
      }
    } else if (anyInProgress(tasks) || nonQcTasks(tasks).some((t) => norm(t.status) === "COMPLETED")) {
      phase = "PRINTING";
      try {
        updateJob(job.jobId, {
          teamExecutionPhase: "PRINTING",
          teamExecutionUpdatedAt: new Date().toISOString(),
        });
      } catch (_e) {
        /* ignore */
      }
    }

    if (phase === "QC" || phase === "PRINTING") {
      setCommPrep(job.jobId, "JOB_STATUS_UPDATE");
    }

    processed.push({ jobId: job.jobId, phase, taskCount: tasks.length });
  }

  return { success: true, processed };
}

function pauseJob(jobId, paused) {
  setJobFlag(jobId, { paused: !!paused });
  return { success: true, jobId, paused: !!paused };
}

function forceJobBullseye(jobId) {
  const id = String(jobId || "").trim();
  if (!id) return { success: false, error: "jobId_required" };
  try {
    updateJob(id, {
      vendorRouteOverride: "BULLSEYE",
      routingNote: "Owner override: force Bullseye",
      teamExecutionUpdatedAt: new Date().toISOString(),
    });
  } catch (_e) {
    /* ignore */
  }
  setJobFlag(id, { forceBullseye: true });
  return { success: true, jobId: id, override: "BULLSEYE" };
}

function markJobComplete(jobId) {
  try {
    updateJob(jobId, {
      teamExecutionPhase: "COMPLETE",
      teamPickupReady: true,
      teamExecutionUpdatedAt: new Date().toISOString(),
    });
  } catch (_e) {
    /* ignore */
  }
  const all = getAssignments();
  const tasks = tasksForJob(jobId, all);
  const now = new Date().toISOString();
  const rows = tasks.map((t) => ({ ...t, status: "COMPLETED", completedAt: now }));
  if (rows.length) upsertAssignments(rows);
  return { success: true, jobId };
}

module.exports = {
  advanceJobs,
  mergeJobsForExecution,
  pauseJob,
  forceJobBullseye,
  markJobComplete,
};
