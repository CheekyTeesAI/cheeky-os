"use strict";

const goalInterpreter = require("./goalInterpreter");

/**
 * Produce Task-shaped recommendations only (caller must enqueue + approvals).
 */


function decomposeToTaskObjects(goalText) {


  try {

      const klass = goalInterpreter.classifyGoal(goalText);


      const themes = Array.isArray(klass.themes) ? klass.themes : [];


      /** @type {object[]} */

      const tasks = [];


      if (themes.includes("school_sales")) {


        tasks.push({

          intent: "marketing_outreach",

          target: `School spirit programs — outreach for: ${String(goalText).slice(0, 120)}`,

          requirements: ["Segment active school accounts", "Pull last season SKUs"],

          priority: "medium",

          source: "planning:v31",

          note: "recommendation_only",

        });


        tasks.push({

          intent: "sales_review",

          target: `Review aging estimates touching: ${String(goalText).slice(0, 100)}`,

          requirements: ["List pending estimates >7d"],

          priority: "medium",

          source: "planning:v31",

        });


      }



      if (themes.includes("revenue") || themes.includes("revenue_recovery")) {

        tasks.push({

          intent: "collections_review",

          target: `Collections pass — correlate unpaid invoices (${String(goalText).slice(0, 80)})`,

          requirements: ["Identify largest open balances"],

          priority: "high",

          source: "planning:v31",

        });

      }



      if (themes.includes("production")) {

        tasks.push({

          intent: "production_planning",

          target: `Unblock overdue production steps — ${String(goalText).slice(0, 100)}`,

          requirements: ["Surface jobs past dueDate", "Check QC bottlenecks"],

          priority: "high",

          source: "planning:v31",

        });

      }



      if (themes.includes("supply_chain")) {

        tasks.push({

          intent: "purchasing",

          target: `Reorder review for blanks / core SKUs`,

          requirements: ["Compare on-hand vs safety stock"],

          priority: "medium",

          source: "planning:v31",

        });

      }



      if (!tasks.length) {

        tasks.push({

          intent: "operational_review",

          target: `General operational review — ${String(goalText).slice(0, 140)}`,

          requirements: ["Scan queue + diagnostics"],

          priority: "low",

          source: "planning:v31",

        });

      }


      return {

        success: true,

        classification: klass,

        tasks,

      };

    } catch (_e) {

      return {

        success: false,

        classification: { success: false, primary: "unknown", themes: [] },

        tasks: [],

      };

    }

}


module.exports = {

  decomposeToTaskObjects,

};
