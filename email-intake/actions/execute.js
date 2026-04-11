"use strict";

const dataverse = require("../lib/integrations/dataverse");
const memory = require("../lib/memory");
const execu = require("../lib/execution");
const sendHandler = require("./send");
const createHandler = require("./create");

/**
 * @param {{ type: string, entity: string, intent: string, data: object, raw: string }} command
 */
module.exports = async function executeHandler(command) {
  console.log("ACTION → EXECUTE", command.entity, command.data);
  const lower = String(command.raw || "").toLowerCase();
  const exec = execu.createExecution("EXECUTE");

  try {
    if (/\b(send|email|mail|follow|message)\b/i.test(lower)) {
      const routed = { ...command, type: "SEND" };
      return sendHandler(routed);
    }
    if (/\b(task|todo|remind)\b/i.test(lower)) {
      const routed = { ...command, type: "CREATE", entity: "task" };
      return createHandler(routed);
    }
    if (/\b(activity|log|note)\b/i.test(lower)) {
      const d = /** @type {Record<string, any>} */ (command.data || {});
      const actRes = await dataverse.createOrderActivity({
        activityType: "execute",
        subject: "Execute intent",
        status: "Logged",
        customerEmail: d.email || "",
        details: command.raw,
        externalId: "",
        source: "cheeky_os_command",
      });
      execu.addStep(exec, "dataverse_order_activity", actRes);
      execu.finalizeMode(exec);
      memory.appendLog(
        `## [${new Date().toISOString()}] EXECUTE activity\n- ${command.raw.slice(0, 200)}\n- ${actRes.message}\n`
      );
      return { success: execu.overallSuccess(exec), execution: exec };
    }

    execu.addStep(exec, "execute_log", {
      success: true,
      mode: "stub",
      message: "Execute intent logged; no specific live job matched",
    });
    execu.finalizeMode(exec);
    memory.appendLog(
      `## [${new Date().toISOString()}] EXECUTE | ${command.entity}\n- ${command.raw.slice(0, 200)}\n`
    );
    return { success: true, execution: exec };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    execu.addStep(exec, "error", { success: false, mode: "stub", message: msg });
    execu.finalizeMode(exec);
    memory.appendLog(`## [${new Date().toISOString()}] EXECUTE ERROR\n- ${msg}\n`);
    return { success: false, execution: exec };
  }
};
