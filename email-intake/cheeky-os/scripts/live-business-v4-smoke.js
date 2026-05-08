"use strict";

const assert = require("assert");
const path = require("path");

const ROOT = path.join(__dirname, "..");

async function main() {

  console.log("[live-business-v4-smoke] start");

  const graph = require(path.join(ROOT, "connectors", "graphEmailConnector"));

  assert.strictEqual(typeof graph.isConfigured(), "boolean");


  if ((process.env.MS_GRAPH_CLIENT_ID || "").trim()) {


    console.log("[live-business-v4-smoke] note: Graph env partially set — isConfigured may be true");

  }

  const sq = require(path.join(ROOT, "connectors", "squareReadConnector"));

  const rd = await sq.readiness();


  assert.ok(rd && typeof rd.authVerified === "boolean");


  const prod = require(path.join(ROOT, "connectors", "productionReadConnector"));

  const q = prod.getProductionQueue();

  assert.ok(q && q.ok);


  const opr = require(path.join(ROOT, "operator", "operatorQueryRouter"));

  const a1 = await opr.routeOperatorQuery({ query: "What did Jessica's last email say?", requestedBy: "smoke" });


  assert.strictEqual(a1.success, true);

  assert.ok(a1.intent && a1.answer);


  const a2 = await opr.routeOperatorQuery({ query: "Who has unpaid invoices?", requestedBy: "smoke" });

  assert.strictEqual(a2.success, true);


  const a3 = await opr.routeOperatorQuery({ query: "What jobs are late?", requestedBy: "smoke" });

  assert.strictEqual(a3.success, true);



  const day = require(path.join(ROOT, "intelligence", "dailyCommandCenter"));

  const brief = await day.buildDailyBriefing();

  assert.strictEqual(brief.success, true);

  assert.ok(brief.recommendedFocus);

  console.log("[live-business-v4-smoke] ok");

}



main().catch((e) => {

  console.error("[live-business-v4-smoke] FAIL", e && e.message ? e.message : e);


  process.exitCode = 1;

});
