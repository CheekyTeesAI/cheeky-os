"use strict";

/** @typedef {"low"|"medium"|"high"|"critical"} Risk */

const CATEGORY = Object.freeze({
  FINANCIAL: "financial",
  PRODUCTION: "production",
  COMMUNICATION: "communication",
  SHELL: "shell",
  BUILD: "build",
  GENERAL: "general",
});

/**
 * Formal policy — workflow gate mirrors these rules (additive; fail-closed upstream).
 */

function classifyFinancialHint(taskObj) {


  try {

    const hay = `${String(taskObj.intent || "")} ${String(taskObj.target || "")} ${(taskObj.requirements || []).join(" ")}`.toLowerCase();

    return /\b(invoice|payment|square|deposit|balance|collections|financial|checkout|estimate sent|billing)\b/.test(hay);

  } catch (_e) {

    return false;

  }

}



function classifyProductionHint(taskObj) {


  try {





    const hay = `${String(taskObj.intent || "")} ${String(taskObj.target || "")}`.toLowerCase();


    return /\b(production|floor|qc|rush job|embroider|print run|routing|purchase order garment|inventory commit)\b/.test(hay);


  } catch (_e) {




    return false;


  }


}




/**
 * Map task → category + nominal risk tier + whether workflow ledger is enforced before runTask().

 *

 * Rules (v5):

 * - critical priority → workflow always

 * - execute → shell tier (approval)

 * - notify → communication (approval)

 * - build → build tier (approval)

 * - finance hints → approval

 * - production-change hints → approval

 * - query/read-only intents → minimal gate (task-queue approve suffices)

 *

 * @param {object} taskObj


 */





function classifyTask(taskObj) {


  try {


    const prio = String(taskObj.priority || "normal").toLowerCase();


    const intent = String(taskObj.intent || "").trim().toLowerCase();



    if (prio === "critical") {


      return {


        category: CATEGORY.GENERAL,


        riskLevel: /** @type {Risk} */ ("critical"),





        workflowRequired: true,

        reasons: ["critical_priority_always_manual_gate"],





      };


    }



    if (intent === "execute") {


      return {


        category: CATEGORY.SHELL,

        riskLevel: "critical",





        workflowRequired: true,

        reasons: ["shell_execute_always_gated"],

      };


    }



    if (intent === "notify") {


      return {


        category: CATEGORY.COMMUNICATION,


        riskLevel: "high",


        workflowRequired: true,


        reasons: ["communication_always_gated"],

      };


    }



    if (intent === "build") {


      return {


        category: CATEGORY.BUILD,





        riskLevel: "medium",


        workflowRequired: true,

        reasons: ["build_execution_always_gated"],




      };


    }



    if (classifyFinancialHint(taskObj)) {


      return {


        category: CATEGORY.FINANCIAL,


        riskLevel: "high",


        workflowRequired: true,


        reasons: ["financial_signals_present"],




      };


    }



    if (classifyProductionHint(taskObj)) {




      return {


        category: CATEGORY.PRODUCTION,

        riskLevel: "medium",


        workflowRequired: true,

        reasons: ["production_change_signals_present"],




      };


    }



    /** default read/query style */




    return {

      category: CATEGORY.GENERAL,


      riskLevel: "low",


      workflowRequired: !!taskObj.approvalRequired,





      reasons: taskObj.approvalRequired ? ["task_flagged_approvalRequired"] : ["minimal_gate_bridge_only"],




    };


  } catch (_e) {




    return {


      category: CATEGORY.GENERAL,


      riskLevel: "high",





      workflowRequired: true,

      reasons: ["classify_threw_fail_closed"],

    };


  }


}





module.exports = {


  CATEGORY,

  classifyTask,

  classifyFinancialHint,

  classifyProductionHint,


};

