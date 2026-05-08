"use strict";

const taskMemory = require("./taskMemory");

const similarity = require("./taskSimilarity");

const summarizer = require("./taskSummarizer");

/** @typedef {{ taskId:string, score:number, reasons:string[], row:object }} Rank */

function rankMemoriesForTask(candidateTask) {
  /** @type {Rank[]} */

  /** @type {Rank[]} */

  const rows = [];

  try {

      const pool = taskMemory.loadAllSync();

      for (let i = 0; i < pool.length; i++) {

        const row = pool[i];

        let s;

        /** @type {string[]} */

        let reasons;

        try {

          const sc = similarity.scoreAgainstMemory(candidateTask, row);

          s = sc.score;

          reasons = sc.reasons;

        } catch (_se) {

          s = 0;

          reasons = [];

        }

        rows.push({
          row,

          reasons,

          taskId: String(row.taskId || row.memoryId || ""),

          score: s,

        });

      }


      rows.sort((a, b) => b.score - a.score);

      return rows;

    } catch (_e) {

      return [];

    }

}

function findRelatedTasks(taskObj, limit) {
  try {
    const ranked = rankMemoriesForTask(taskObj);
    const n = Math.min(25, Math.max(1, Number(limit) || 8));
    return { success: true, related: ranked.slice(0, n) };
  } catch (_e) {
    return {
      success: false,
      related: [],

    };
  }
}

function suggestPriorSolutions(taskObj) {

  try {

      const ranked = rankMemoriesForTask(taskObj);

      const failures = ranked.filter((r) => String(r.row && r.row.outcome) === "failed");

      /** @type {string[]} */

      const tips = [];

      failures.slice(0, 5).forEach((f) => {

        tips.push(summarizer.summarizePastFailure(f.row));

      });

      return {

        success: true,

        tips,

      };

    } catch (_e) {

      return {

        success: false,

        tips: [],

      };

    }

}

function generateTaskContext(taskObj) {
  try {
    const ranked = rankMemoriesForTask(taskObj);
    const compact = ranked.slice(0, 6).map((r) => summarizer.summarizeMemoryRow(r.row));
    return {
      success: true,
      contextLines: compact,
      topSignals: ranked.slice(0, 3).map((r) => ({ score: r.score, reasons: r.reasons.slice(0, 4), taskId: r.taskId })),
    };
  } catch (_e) {
    return {
      success: false,
      contextLines: [],
      topSignals: [],

    };
  }
}

module.exports = {

  rankMemoriesForTask,

  findRelatedTasks,

  suggestPriorSolutions,

  generateTaskContext,

};
