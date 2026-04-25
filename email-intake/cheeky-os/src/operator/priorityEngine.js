"use strict";

module.exports = function buildPriorities(data) {
  try {
    let priorities = [];

    // 1. OVERDUE TASKS (HIGHEST)
    if (data && data.alerts) {
      data.alerts.forEach((alert) => {
        if (alert && alert.type === "OVERDUE_TASKS") {
          priorities.push({
            level: 1,
            message: `Fix overdue tasks (${alert.count})`,
            action: "HANDLE_OVERDUE",
          });
        }
      });
    }

    // 2. PRODUCTION READY BACKLOG
    if (data && data.queues && data.queues.productionReady && data.queues.productionReady.length > 0) {
      priorities.push({
        level: 2,
        message: `Start printing (${data.queues.productionReady.length} jobs ready)`,
        action: "START_PRINTING",
      });
    }

    // 3. PRINTING IN PROGRESS
    if (data && data.queues && data.queues.printing && data.queues.printing.length > 0) {
      priorities.push({
        level: 3,
        message: `Monitor printing (${data.queues.printing.length} active jobs)`,
        action: "MONITOR_PRINTING",
      });
    }

    // 4. NO ORDERS ALERT
    if ((((data && data.metrics) || {}).ordersToday || 0) === 0) {
      priorities.push({
        level: 1,
        message: "No orders today — push sales",
        action: "SALES_ALERT",
      });
    }

    priorities = priorities
      .filter((p) => p.level <= 2) // only high priority
      .sort((a, b) => a.level - b.level);

    return priorities;
  } catch (_) {
    return [];
  }
};
