"use strict";

function generateTasksForOrder(order) {
  const tasks = [];
  const row = order && typeof order === "object" ? order : {};
  const hasApprovedArt = Array.isArray(row.artFiles)
    ? row.artFiles.some((a) => a && a.approvalStatus === "APPROVED")
    : false;

  if (!row.depositPaid) {
    tasks.push({ type: "COLLECT_DEPOSIT", owner: "Cheeky" });
  }

  if (row.depositPaid && !row.garmentsOrdered) {
    tasks.push({ type: "ORDER_GARMENTS", owner: "Jeremy" });
  }

  if (row.garmentsOrdered && !row.garmentsReceived) {
    tasks.push({ type: "WAIT_GARMENTS", owner: "System" });
  }

  if (!hasApprovedArt) {
    tasks.push({ type: "APPROVE_ART", owner: "Cheeky" });
  }

  if (row.garmentsReceived && !row.productionComplete) {
    tasks.push({ type: "RUN_PRODUCTION", owner: "Jeremy" });
  }

  if (row.productionComplete && !row.qcComplete) {
    tasks.push({ type: "QC_CHECK", owner: "Jeremy" });
  }

  if (row.qcComplete) {
    tasks.push({ type: "READY_PICKUP", owner: "Cheeky" });
  }

  return tasks;
}

module.exports = { generateTasksForOrder };
