/**
 * Shared team board snapshot for HTTP routes and /command.
 */
const { advanceJobs } = require("./productionFlowEngine");
const { getAssignments, getCompletedToday } = require("./teamTaskStore");
const { routeServiceDeskItems, getRoleQueue } = require("./teamHandoffEngine");

function norm(s) {
  return String(s || "").toUpperCase();
}

async function getTeamBoardData() {
  await advanceJobs();
  const all = getAssignments();
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = getCompletedToday();
  const assignedTasks = all.filter((a) => norm(a.status) === "PENDING");
  const inProgress = all.filter((a) => norm(a.status) === "IN_PROGRESS");
  const blocked = all.filter((a) => norm(a.status) === "BLOCKED");
  const doneIds = new Set(completedToday.map((c) => c.taskId));
  const completedTodayTasks = all.filter(
    (a) => doneIds.has(a.taskId) || (a.completedAt && String(a.completedAt).slice(0, 10) === today)
  );

  let serviceDesk = { queues: {}, byRole: {} };
  try {
    const routed = routeServiceDeskItems();
    serviceDesk.queues = routed.queues || {};
    serviceDesk.counts = routed.counts || {};
    for (const role of ["OWNER", "PRINTER", "ADMIN", "DESIGN"]) {
      serviceDesk.byRole[role] = getRoleQueue(role).slice(0, 40);
    }
  } catch (_e) {
    serviceDesk = { queues: {}, byRole: {}, error: "service_desk_unavailable" };
  }

  return {
    assignedTasks,
    inProgress,
    blocked,
    completedToday: completedTodayTasks.length ? completedTodayTasks : completedToday,
    date: today,
    serviceDesk,
  };
}

module.exports = {
  getTeamBoardData,
};
