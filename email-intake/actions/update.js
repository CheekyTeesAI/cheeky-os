"use strict";

const dataverse = require("../lib/integrations/dataverse");
const memory = require("../lib/memory");
const execu = require("../lib/execution");

/**
 * @param {{ type: string, entity: string, intent: string, data: object, raw: string }} command
 */
module.exports = async function updateHandler(command) {
  console.log("ACTION → UPDATE", command.entity, command.data);
  const exec = execu.createExecution("UPDATE");
  const d = /** @type {Record<string, any>} */ (command.data || {});

  try {
    const actRes = await dataverse.createOrderActivity({
      activityType: "update_request",
      subject: `Update: ${command.entity}`,
      status: "Logged",
      customerEmail: d.email || "",
      details: command.raw,
      externalId: "",
      source: "cheeky_os_command",
    });
    execu.addStep(exec, "dataverse_update_activity", actRes);

    execu.finalizeMode(exec);

    const slug = execu.slug(`update_${command.entity}`);
    memory.writeCommandSummary(
      "production",
      slug,
      `# UPDATE ${command.entity}\n\n${command.raw}\n\n${actRes.message}`
    );
    memory.appendLog(
      `## [${new Date().toISOString()}] UPDATE | ${command.entity} | ${exec.mode}\n- ${command.raw.slice(0, 200)}\n- ${actRes.message}\n`
    );

    return { success: execu.overallSuccess(exec), execution: exec };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    execu.addStep(exec, "error", { success: false, mode: "stub", message: msg });
    execu.finalizeMode(exec);
    memory.appendLog(`## [${new Date().toISOString()}] UPDATE ERROR\n- ${msg}\n`);
    return { success: false, execution: exec };
  }
};
