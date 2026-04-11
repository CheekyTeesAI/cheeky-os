"use strict";

const { createTask } = require("./taskStore");

/**
 * @param {string} stage
 * @returns {{ owner: string; role: string }}
 */
function assignOwner(stage) {
  if (stage === "INTAKE") return { owner: "Patrick", role: "owner" };
  if (stage === "ART") return { owner: "Designer", role: "design" };
  if (stage === "PRINT") return { owner: "Printer", role: "production" };
  if (stage === "QC") return { owner: "Patrick", role: "quality" };
  if (stage === "COMPLETE") return { owner: "System", role: "done" };

  return { owner: "unassigned", role: "general" };
}

/**
 * @param {string} stage
 * @returns {string}
 */
function assignPriority(stage) {
  if (stage === "INTAKE") return "high";
  if (stage === "ART") return "normal";
  if (stage === "PRINT") return "high";
  if (stage === "QC") return "normal";
  if (stage === "COMPLETE") return "low";
  return "normal";
}

/**
 * @param {string} stage
 * @param {string} name
 */
function titleForStage(stage, name) {
  if (stage === "INTAKE") return `INTAKE — Review order for ${name}`;
  if (stage === "ART") return `ART — Create mockup for ${name}`;
  if (stage === "PRINT") return `PRINT — Print order for ${name}`;
  if (stage === "QC") return `QC — Quality check for ${name}`;
  if (stage === "COMPLETE") return `COMPLETE — Ready for pickup for ${name}`;
  return `${stage} — ${name}`;
}

/**
 * @param {{ data?: Record<string, unknown> }} parsed
 * @returns {Array<Record<string, unknown>>}
 */
function generateTasksFromOrder(parsed) {
  const d = parsed && parsed.data ? parsed.data : {};
  const name = String(d.firstName || "Customer").trim() || "Customer";

  const stages = ["INTAKE", "ART", "PRINT", "QC", "COMPLETE"];

  return stages.map((stage) => {
    const assignment = assignOwner(stage);
    const priority = assignPriority(stage);

    return createTask({
      title: titleForStage(stage, name),
      stage,
      priority,
      ...assignment,
    });
  });
}

/**
 * Money tasks on estimate / revenue events (INTAKE, Patrick, high).
 * @param {string} customerName
 * @returns {Array<Record<string, unknown>>}
 */
function generateRevenueTasks(customerName) {
  const name = String(customerName || "Customer").trim() || "Customer";
  const owner = assignOwner("INTAKE");
  const priority = "high";
  const a = createTask({
    title: `FOLLOW UP — ${name}`,
    stage: "INTAKE",
    status: "pending",
    priority,
    kind: "revenue",
    ...owner,
  });
  const b = createTask({
    title: `CLOSE DEAL — ${name}`,
    stage: "INTAKE",
    status: "pending",
    priority,
    kind: "revenue",
    ...owner,
  });
  return [a, b];
}

/**
 * Extra follow-up reminder task after automated follow-up email.
 * @param {string} customerName
 */
function generateRevenueFollowUpTask(customerName) {
  const name = String(customerName || "Customer").trim() || "Customer";
  return createTask({
    title: `FOLLOW UP — ${name}`,
    stage: "INTAKE",
    status: "pending",
    priority: "high",
    kind: "revenue_followup",
    ...assignOwner("INTAKE"),
  });
}

/**
 * Paid order → production board tasks (uses INTAKE/ART/PRINT/QC/COMPLETE stages).
 * @param {Record<string, unknown>} order
 * @returns {Array<Record<string, unknown>>}
 */
function generateTasksFromPaidOrder(order) {
  const o = order && typeof order === "object" ? order : {};
  const cust = String(o.customer || "Customer").trim() || "Customer";
  const routing = String(o.routing || "undecided");
  const isVendor = routing === "vendor";

  /** @type {Array<{ stage: string; title: string; owner: string; role: string }>} */
  let rows;
  if (isVendor) {
    rows = [
      {
        stage: "INTAKE",
        title: `REVIEW — Review paid order — ${cust}`,
        owner: "Patrick",
        role: "owner",
      },
      {
        stage: "ART",
        title: `ART — Finalize art for vendor — ${cust}`,
        owner: "Designer",
        role: "design",
      },
      {
        stage: "PRINT",
        title: `PRODUCTION — Send to vendor — ${cust}`,
        owner: "Vendor",
        role: "production",
      },
      {
        stage: "QC",
        title: `QC — Receive/check vendor order — ${cust}`,
        owner: "Patrick",
        role: "quality",
      },
      {
        stage: "COMPLETE",
        title: `COMPLETE — Ready for pickup — ${cust}`,
        owner: "System",
        role: "done",
      },
    ];
  } else {
    rows = [
      {
        stage: "INTAKE",
        title: `REVIEW — Review paid order — ${cust}`,
        owner: "Patrick",
        role: "owner",
      },
      {
        stage: "ART",
        title: `ART — Finalize print file — ${cust}`,
        owner: "Designer",
        role: "design",
      },
      {
        stage: "PRINT",
        title: `PRODUCTION — Print in house — ${cust}`,
        owner: "Printer",
        role: "production",
      },
      {
        stage: "QC",
        title: `QC — Wash/check/fold — ${cust}`,
        owner: "Patrick",
        role: "quality",
      },
      {
        stage: "COMPLETE",
        title: `COMPLETE — Ready for pickup — ${cust}`,
        owner: "System",
        role: "done",
      },
    ];
  }

  return rows.map((row) => {
    const priority = assignPriority(row.stage);
    return createTask({
      title: row.title,
      stage: row.stage,
      status: "pending",
      priority,
      kind: "paid_order",
      orderId: o.id,
      owner: row.owner,
      role: row.role,
    });
  });
}

module.exports = {
  assignOwner,
  assignPriority,
  titleForStage,
  generateTasksFromOrder,
  generateRevenueTasks,
  generateRevenueFollowUpTask,
  generateTasksFromPaidOrder,
};
