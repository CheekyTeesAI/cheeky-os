"use strict";

const cursorAdapter = require("./cursorAdapter");
const codexAdapter = require("./codexAdapter");
const shellAdapter = require("./shellAdapter");
const agentRunner = require("../agent/agentRunner");

/**
 * Route task intent → adapters. Default dry-run unless opts.execute explicitly true AND intent allows runner.
 */

async function routeTask(taskObj, opts) {
  try {
    if (!taskObj || typeof taskObj !== "object")
      return { success: false, error: "invalid_task_object" };

    const intent = String(taskObj.intent || "").trim().toLowerCase();
    const execAllowed = !!(opts && opts.execute === true);
    /** @type {object[]} */
    const steps = [];

    if (intent === "build") {
      const cu = cursorAdapter.planForTask(taskObj, { dryRun: true });
      const co = codexAdapter.planForTask(taskObj, { dryRun: true });
      steps.push({ layer: "cursor", plan: cu });
      steps.push({ layer: "codex", plan: co });
      steps.push({
        layer: "note",
        message: "build_intent_routes_to_local_IDEs_cli_first_no_spawn",
      });
      return { success: true, intent: "build", primary: "cursor|codex", dryRunPrimary: true, steps };
    }

    if (intent === "execute") {
      const line = String(taskObj.target || "");
      const planDry = await shellAdapter.runWhitelisted(line, Object.assign({}, opts || {}, { dryRun: true }));
      if (!execAllowed) {
        steps.push({ layer: "shell", planDry });
        return { success: true, intent: "execute", primary: "shell", dryRunOnly: true, steps };
      }
      const ran = await shellAdapter.runWhitelisted(line, {
        dryRun: false,
        taskEnvelope: Object.assign({}, taskObj),
        taskId: taskObj.taskId,
      });
      steps.push({ layer: "shell", ran });
      return { success: !!ran.success, intent: "execute", primary: "shell", steps };
    }

    if (intent === "query") {
      const mock = await agentRunner.runTask(
        Object.assign({}, taskObj, {
          requirements: taskObj.requirements && taskObj.requirements.length ? taskObj.requirements : ["query_router"],
        })
      );
      steps.push({ layer: "agentRunner_query", mock });
      return { success: true, intent: "query", primary: "internal_readonly", steps };
    }

    if (intent === "notify") {
      const n = await agentRunner.runTask(
        Object.assign({}, taskObj, {
          requirements: taskObj.requirements && taskObj.requirements.length ? taskObj.requirements : ["notify_router"],
        })
      );
      steps.push({ layer: "notification_queue", n });
      return { success: !!n.success || !!n.ok, intent: "notify", primary: "notifications_jsonl", steps };
    }

    return { success: false, error: "unsupported_intent", intent };
  } catch (e) {
    return { success: false, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = {
  routeTask,
};
