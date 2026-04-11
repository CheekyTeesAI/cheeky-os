"use strict";

const memory = require("../lib/memory");
const execu = require("../lib/execution");

/**
 * @param {{ type: string, entity: string, data: object, raw: string }} command
 */
module.exports = async function analyzeHandler(command) {
  console.log("ACTION → ANALYZE", command.entity, command.data);
  const exec = execu.createExecution("ANALYZE");
  try {
    execu.addStep(exec, "analyze_placeholder", {
      success: true,
      mode: "stub",
      message: "Analysis placeholder — connect operator/AI layer later",
    });
    execu.finalizeMode(exec);
    memory.writeCommandSummary(
      "pricing",
      execu.slug("analyze"),
      `# ANALYZE\n\n${command.raw}`
    );
    memory.appendLog(
      `## [${new Date().toISOString()}] ANALYZE | ${command.entity}\n- ${command.raw.slice(0, 200)}\n`
    );
    return {
      success: true,
      execution: exec,
      insights: [],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    execu.addStep(exec, "error", { success: false, mode: "stub", message: msg });
    execu.finalizeMode(exec);
    return { success: false, execution: exec };
  }
};
