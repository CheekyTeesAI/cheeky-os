"use strict";

/**
 * Non-destructive module smoke for Cheeky OS Agent Intel v3.1.
 * Run: node scripts/agent-intel-v31-smoke.js
 */

const assert = require("assert");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function run() {

  console.log("[v31-smoke] start");

  const safety = require(path.join(ROOT, "agent", "safetyGuard"));

  const b = safety.standardizedRateLimitHttpBody({ tasksThisHour: 99, limit: 10, retryAfterSeconds: 12 });


  assert.strictEqual(b.success, false);

  assert.strictEqual(b.error, "rate_limit_exceeded");


  assert.ok(typeof b.tasksThisHour === "number");

  assert.ok(typeof b.limit === "number");


  assert.ok(typeof b.retryAfterSeconds === "number");


  const delegationEngine = require(path.join(ROOT, "subagents", "delegationEngine"));

  const d1 = delegationEngine.pickAgentForTask({ intent: "build", target: "square unpaid invoices draft" });

  assert.ok(d1 && d1.selectedAgent);

  const d2 = delegationEngine.pickAgentForParsed({ intent: "graph_lookup", text: "neighbor", entities: {} });

  assert.strictEqual(d2.selectedAgent, "graphQuery");

  const semanticTaskEngine = require(path.join(ROOT, "memory", "semanticTaskEngine"));

  const rel = semanticTaskEngine.findRelatedTasks({ intent: "build", target: "connector", requirements: ["auth"] }, 3);

  assert.ok(rel && rel.success);

  const eventEmitter = require(path.join(ROOT, "events", "eventEmitter"));

  const bad = eventEmitter.appendExpandedEvent({ type: "not_a_real_type", payload: {} });

  assert.strictEqual(bad.ok, false);


  const eventQuery = require(path.join(ROOT, "events", "eventQuery"));

  const q0 = eventQuery.query({ type: "agent_intel_smoke", limit: 5 });

  assert.ok(q0 && q0.success);


  const eventReducer = require(path.join(ROOT, "events", "eventReducer"));

  const sum = eventReducer.summarize(eventQuery.parseLines(), 168);

  assert.ok(sum && sum.success);


  const relationshipEngine = require(path.join(ROOT, "graph", "relationshipEngine"));

  const entityRegistry = require(path.join(ROOT, "graph", "entityRegistry"));

  const graphQuery = require(path.join(ROOT, "graph", "graphQuery"));

  const demoC = entityRegistry.makeEntityId("customer", "smoke-cust");

  assert.ok(demoC);

  relationshipEngine.registerEntity({ id: demoC, entityType: "customer", attrs: { smoke: true } });

  const gq = graphQuery.neighborhood(demoC, { maxDepth: 1, maxEdges: 20 });

  assert.ok(gq && gq.success);


  const recommendationEngine = require(path.join(ROOT, "planning", "recommendationEngine"));

  const plan = recommendationEngine.recommendFromGoal("Increase school sales next quarter");

  assert.ok(plan && plan.success);

  assert.ok(Array.isArray(plan.recommendations));


  const voiceIntentRouter = require(path.join(ROOT, "voice", "voiceIntentRouter"));

  const vr = voiceIntentRouter.routeFromPhrase("What jobs are late on the floor?");

  assert.ok(vr && vr.success);

  assert.ok(vr.channel);


  const taskQueue = require(path.join(ROOT, "agent", "taskQueue"));

  taskQueue.readAllTasksSync();


  const processorLock = require(path.join(ROOT, "agent", "processorLock"));

  processorLock.ensureLockRecoverable();


  const orchestrationRecovery = require(path.join(ROOT, "agent", "orchestrationRecovery"));

  orchestrationRecovery.runStaleRunningRecovery();


  console.log("[v31-smoke] all checks passed");

}

try {


  run();

} catch (e) {


  console.error("[v31-smoke] FAILED", e && e.message ? e.message : e);

  process.exitCode = 1;

}
