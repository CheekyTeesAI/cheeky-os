/**
 * Dashboard + API bundle for service desk (additive).
 */
const { getAllServiceDeskItems } = require("./serviceDeskService");
const { routeServiceDeskItems } = require("./teamHandoffEngine");

function uc(s) {
  return String(s || "").toUpperCase();
}

function buildServiceDeskDashboardBundle() {
  const all = getAllServiceDeskItems();
  const summary = {
    newCount: all.filter((i) => uc(i && i.state) === "NEW").length,
    autoHandledCount: all.filter((i) => uc(i && i.state) === "AUTO_HANDLED").length,
    waitingTeamCount: all.filter((i) => uc(i && i.state) === "WAITING_TEAM").length,
    waitingCustomerCount: all.filter((i) => uc(i && i.state) === "WAITING_CUSTOMER").length,
    escalatedCount: all.filter((i) => uc(i && i.state) === "ESCALATED").length,
    ownerApprovalCount: all.filter(
      (i) => i && (i.requiresApproval === true || uc(i.waitSubState) === "WAITING_APPROVAL")
    ).length,
  };
  const ownerExceptions = all
    .filter(
      (i) =>
        i &&
        (uc(i.state) === "ESCALATED" ||
          (uc(i.assignedToRole) === "OWNER" && !/CLOSED|AUTO_HANDLED/.test(uc(i.state))))
    )
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 40);
  const { queues } = routeServiceDeskItems();
  const recentAutoHandled = all
    .filter((i) => i && uc(i.state) === "AUTO_HANDLED")
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 20);
  return {
    serviceDeskSummary: summary,
    ownerExceptions,
    teamServiceQueues: queues,
    recentAutoHandled,
  };
}

module.exports = {
  buildServiceDeskDashboardBundle,
};
