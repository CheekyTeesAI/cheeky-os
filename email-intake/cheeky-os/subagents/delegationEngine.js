"use strict";

const safety = require("../agent/safetyGuard");

/**
 * Route by intent / target heuristics with lightweight risk awareness.
 */

function tokenize(s) {


  try {

      return String(s || "").toLowerCase().split(/\W+/).filter(Boolean);

    } catch (_e) {

      return [];

    }


}

/**

 * @param {{ intent?: string, target?: string, requirements?: string[] }} taskObj


 */

function pickAgentForTask(taskObj) {


  try {

      const intent = tokenize(taskObj && taskObj.intent).join(" ");

      const target = tokenize(taskObj && taskObj.target).join(" ");

      const blob = `${intent} ${target}`;



      /** @type {string} */


      let selected = "diagnosticsAgent";

      let confidence = 0.52;

      let reasoning = "default_health_surface";



      const risk = safety.assessRisk(taskObj || {});



      if (/square|invoice|deposit|estimate|cash|sku price\b/.test(blob)) {



        selected = "squareAgent";

        confidence = 0.71;

        reasoning = "financial_language_detected";


      }



      if (/email|reply|mailbox|subject|customer message\b/.test(blob)) {


        selected = "emailAgent";

        confidence = 0.74;

        reasoning = "comms_language_detected";

      }



      if (/production|floor|embroider|qc|deadline|late job\b/.test(blob)) {

        selected = "productionAgent";


        confidence = 0.78;

        reasoning = "ops_floor_language";


      }



      if (/memory|prior|similar|architecture|lesson learned\b/.test(blob)) {


        selected = "memoryAgent";

        confidence = 0.66;

        reasoning = "knowledge_retrieval_language";


      }



      if (/plan|prioritize|roadmap|increase .*sales\b/.test(blob)) {


        selected = "planningAgent";


        confidence = 0.63;

        reasoning = "planning_language";


      }



      if (risk.riskLevel === "high" && selected !== "diagnosticsAgent") {


        reasoning = `${reasoning};risk_${risk.riskLevel}_prefers_human_review`;

        confidence = Math.min(confidence, 0.62);

      }



      return { selectedAgent: selected, confidence, reasoning, risk: risk.riskLevel };

    } catch (_e) {

      return {

        selectedAgent: "diagnosticsAgent",

        confidence: 0.4,

        reasoning: "delegation_error_fail_closed",

        risk: "high",

      };

    }

}

/**

 * @param {{ intent?: string, text?: string, entities?: object }} parsed

 */

function pickAgentForParsed(parsed) {


  try {

      const p = parsed && typeof parsed === "object" ? parsed : {};

      const intent = String(p.intent || "");

      const text = String(p.text || "");

      if (intent === "graph_lookup") {


        return {

          selectedAgent: "graphQuery",

          confidence: 0.74,

          reasoning: "explicit_graph_lookup_intent",

          risk: "low",

        };


      }





      return pickAgentForTask({ intent, target: text, requirements: Object.keys(p.entities || {}) });

    } catch (_e) {

      return {

        selectedAgent: "diagnosticsAgent",

        confidence: 0.4,

        reasoning: "parsed_delegation_error",

        risk: "high",

      };

    }

}

module.exports = {

  pickAgentForTask,

  pickAgentForParsed,

};
