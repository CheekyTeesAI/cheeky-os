"use strict";

/**
 * Jarvis Transition Layer v6 smoke (modules + minimal flows).
 */

const path = require("path");
process.chdir(path.join(__dirname, ".."));

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "fail");
}

async function main() {
  console.log("[v6-smoke] cwd=%s", process.cwd());

  const clf = require("../operator/operatorIntentClassifier");
  const c = clf.classifyOperatorIntent("", "What's most important today for invoices?");
  assert(c.intent === "financial" || c.intent === "operational_summary", "classifier");

  const nle = require("../operator/naturalLanguageEngine");
  const ans = nle.processNaturalLanguage("What jobs are late and what needs approval?", {});
  assert(ans.answer && ans.intent, "natural language engine");

  const { computeOperationalPriorities } = require("../intelligence/priorityEngine");
  const pr = computeOperationalPriorities(10);
  assert(Array.isArray(pr), "priorities");

  const oce = require("../memory/operationalContinuityEngine");
  oce.recordInteractionTurn({ kind: "smoke", note: "v6" });
  const snap = oce.getContinuitySnapshot();
  assert(snap && snap.version, "continuity");

  const norm = require("../voice/voiceCommandNormalizer");
  const n2 = norm.normalizeVoiceCommand("Um, show unpaid invoices please");
  assert(n2.normalizedText.length > 0, "voice norm");

  const vmap = require("../voice/voiceActionMapper");
  const h = vmap.mapVoiceToIntentHint(n2.normalizedText);
  assert(h && typeof h.confidence === "number", "voice map");

  const pol = require("../execution/executionPolicies");
  assert(pol.policyForCapability("shell") === pol.APPROVAL_REQUIRED, "policy shell");

  const orch = require("../execution/liveExecutionOrchestrator");

  let r0 = await orch.orchestrateExecution({
    mode: "enqueue",
    taskSpec: { intent: "query", target: "smoke-ro", requirements: ["read"] },
    actor: "v6-smoke",
  });
  assert(r0.ok === false && r0.error === "read_only_no_execution", "read_only guarded");

  const r1 = await orch.orchestrateExecution({
    mode: "enqueue",
    taskSpec: { intent: "build", target: "log", requirements: ["npm run lint"] },
    actor: "v6-smoke",
  });
  assert(r1.ok === true && r1.enqueue && r1.enqueue.ok === true, "enqueue build intent");

  if (r1.enqueue && r1.enqueue.task && r1.enqueue.task.taskId) {
    taskQueueRejectSafe(r1.enqueue.task.taskId);
  }

  const tl = require("../diagnostics/executionTimeline");
  assert(tl.appendTimelineEvent({ phase: "smoke", note: "v6" }).ok === true, "timeline");

  const it = require("../diagnostics/incidentTracker");
  assert(it.recordIncident({ type: "smoke", severity: "info", detail: "v6" }).ok === true, "incident");

  const { buildExecutiveBriefing } = require("../intelligence/executiveBriefingEngine");
  const brief = buildExecutiveBriefing("daily");
  assert(brief.narrative && Array.isArray(brief.sections), "executive brief");

  console.log("[v6-smoke] OK");
}

function taskQueueRejectSafe(taskId) {
  try {
    const tq = require("../agent/taskQueue");
    tq.rejectTask(taskId, "v6-smoke_cleanup");
  } catch (_e) {}
}

main().catch((e) => {
  console.error("[v6-smoke] FAILED:", e && e.message ? e.message : e);
  process.exitCode = 1;
});
