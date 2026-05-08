"use strict";

const taskMemory = require("./taskMemory");

function summarizePastFailure(memRow) {
  try {
    const intent = String((memRow && memRow.category) || "task");
    const tgt = String((memRow && memRow.targetKey) || memRow.summary || "").slice(0, 140);
    return `Prior ${intent} work on ${tgt} failed — review requirements and infra before retrying.`;
  } catch (_e) {
    return "Prior task failure recorded.";
  }
}

function summarizeMemoryRow(memRow) {
  try {
      return String(memRow.summary || "").slice(0, 240);
    } catch (_e) {
      return "";
    }
}

/**
 * Persist a human-readable synopsis into semantic memory spine.
 */

function persistSummaryLine(taskHint, synopsis, outcomeLabel) {

  try {

      return taskMemory.appendRow({

        memoryId: `sum-${Date.now()}`,

        taskId: (taskHint && taskHint.taskId) || null,

        category: "semantic_summary",

        targetKey:

          String((taskHint && taskHint.target) || "summary")

          .toLowerCase()

          .replace(/[^a-z0-9]+/g, "-")

          .slice(0, 48),

        summary: String(synopsis || "").slice(0, 500),

        tags: ["summary", outcomeLabel].filter(Boolean),

        outcome: String(outcomeLabel || "completed"),

        timestamp: new Date().toISOString(),

        metadata: { source: "taskSummarizer_v31" },

      });

    } catch (_e) {

      return {

        ok: false,

      };

    }

}

module.exports = {

  summarizePastFailure,

  summarizeMemoryRow,

  persistSummaryLine,

};
