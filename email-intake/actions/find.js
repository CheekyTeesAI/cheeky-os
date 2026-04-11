"use strict";

const memory = require("../lib/memory");
const execu = require("../lib/execution");

/**
 * @param {{ type: string, entity: string, data: object, raw: string }} command
 */
module.exports = async function findHandler(command) {
  console.log("ACTION → FIND", command.entity, command.data);
  const exec = execu.createExecution("FIND");
  try {
    execu.addStep(exec, "find_placeholder", {
      success: true,
      mode: "stub",
      message: "Find intent logged; live CRM search not wired in this phase",
    });
    execu.finalizeMode(exec);
    memory.appendLog(
      `## [${new Date().toISOString()}] FIND | ${command.entity}\n- query: ${command.raw.slice(0, 200)}\n`
    );
    return {
      success: true,
      execution: exec,
      results: [],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    execu.addStep(exec, "error", { success: false, mode: "stub", message: msg });
    execu.finalizeMode(exec);
    return { success: false, execution: exec };
  }
};
