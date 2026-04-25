"use strict";

const pendingApprovals = new Map();

function createApproval(payload = {}) {
  const id = "apr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);

  pendingApprovals.set(id, {
    id,
    createdAt: new Date().toISOString(),
    status: "PENDING",
    payload,
  });

  return {
    success: true,
    approvalId: id,
    status: "PENDING",
    payload,
  };
}

function approve(approvalId) {
  const item = pendingApprovals.get(approvalId);

  if (!item) {
    return { success: false, message: "Approval not found" };
  }

  item.status = "APPROVED";
  pendingApprovals.set(approvalId, item);

  return { success: true, approval: item };
}

function reject(approvalId) {
  const item = pendingApprovals.get(approvalId);

  if (!item) {
    return { success: false, message: "Approval not found" };
  }

  item.status = "REJECTED";
  pendingApprovals.set(approvalId, item);

  return { success: true, approval: item };
}

function list() {
  return {
    success: true,
    approvals: Array.from(pendingApprovals.values()).slice(-25).reverse(),
  };
}

function get(approvalId) {
  const item = pendingApprovals.get(approvalId);

  if (!item) {
    return { success: false, message: "Approval not found" };
  }

  return { success: true, approval: item };
}

module.exports = {
  createApproval,
  approve,
  reject,
  list,
  get,
};
