/**
 * Maps production task names to team roles — additive to taskEngine templates.
 */
const { generateTasks } = require("./taskEngine");
const {
  getPrinterAssigneeId,
  getDesignAssigneeId,
  getOwnerAssigneeId,
} = require("./teamService");
const { stableTaskId, upsertAssignments, getAssignments } = require("./teamTaskStore");

function classifyTaskName(name) {
  const n = String(name || "").toLowerCase();
  if (/qc|quality/.test(n)) return "PRINTER";
  if (/print|cure|pretreat|load|press|stitch|hoop|trim|peel|weed|vinyl|screen setup|burn|embroid/.test(n))
    return "PRINTER";
  if (/review|determine|detail|art|setup press|burn screen/.test(n)) return "DESIGN";
  return "ADMIN";
}

function roleToAssignee(role) {
  const r = String(role || "").toUpperCase();
  if (r === "PRINTER") return getPrinterAssigneeId();
  if (r === "DESIGN") return getDesignAssigneeId();
  return getOwnerAssigneeId();
}

/**
 * Build / merge assignments for jobs (idempotent per taskId).
 * @param {object[]} jobs
 * @returns {object[]}
 */
function assignTasks(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const out = [];
  const existing = new Map(getAssignments().map((a) => [a.taskId, a]));

  for (const job of list) {
    if (!job || !job.jobId) continue;
    const gen = generateTasks(job);
    const tasks = Array.isArray(gen.tasks) ? gen.tasks : [];
    tasks.forEach((t, idx) => {
      const name = t.name || `Task ${idx + 1}`;
      const taskId = stableTaskId(job.jobId, name, idx + 1);
      const roleKind = classifyTaskName(name);
      const assignedTo = roleToAssignee(roleKind === "ADMIN" ? "OWNER" : roleKind);

      const prev = existing.get(taskId);
      const row = {
        taskId,
        assignedTo,
        jobId: job.jobId,
        task: name,
        status: prev && prev.status ? prev.status : "PENDING",
        roleKind,
        printMethod: gen.printMethod || null,
      };
      if (prev && prev.startedAt) row.startedAt = prev.startedAt;
      if (prev && prev.blockedReason) row.blockedReason = prev.blockedReason;
      out.push(row);
    });
  }

  if (out.length) upsertAssignments(out);
  return out.map((r) => ({
    taskId: r.taskId,
    assignedTo: r.assignedTo,
    jobId: r.jobId,
    task: r.task,
    status: r.status,
  }));
}

module.exports = {
  assignTasks,
  classifyTaskName,
};
