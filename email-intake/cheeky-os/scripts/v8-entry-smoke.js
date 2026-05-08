"use strict";

/**
 * v8 smoke — module load + routers (cwd-independent).
 */

const path = require("path");
const ROOT = path.join(__dirname, "..");

function rq(rel) {
  return require(path.join(ROOT, rel));
}

async function main() {
  rq("workflow/orderStateMachine.js");
  rq("workflow/orderWorkflowRules.js");
  rq("dashboard/dashboardDataService.js");
  rq("operator/mainOperatorEngine.js");

  console.log("[v8-smoke] modules ok");

  const mainOp = rq("routes/mainOperator.js");
  const dash = rq("routes/operatorDashboard.js");
  const wo = rq("routes/workOrdersV8.route.js");
  const go = rq("routes/garmentOrders.js");

  for (const r of [mainOp, dash, wo, go]) {
    if (!r || typeof r.handle !== "function") throw new Error("router_missing");
  }
  console.log("[v8-smoke] routers loaded");
}

main().catch((e) => {
  console.error("[v8-smoke] FAIL:", e.message || e);
  process.exitCode = 1;
});
