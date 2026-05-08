"use strict";

/**
 * Lazy-loaded agent modules — keeps cold paths cheap.

 * @returns {Record<string, object>}

 */
function snapshot() {


  try {

      return {


        squareAgent: { capability: "read_only_square_snapshots", path: "./squareAgent.js" },

        emailAgent: { capability: "read_only_inbound_json", path: "./emailAgent.js" },

        productionAgent: { capability: "read_only_shop_floor_json", path: "./productionAgent.js" },

        memoryAgent: { capability: "read_only_semantic_indexes", path: "./memoryAgent.js" },

        diagnosticsAgent: { capability: "read_only_processor_signals", path: "./diagnosticsAgent.js" },

        planningAgent: { capability: "recommend_only_plans", path: "./planningAgent.js" },

        graphQuery: { capability: "read_only_relationship_walk", path: "../graph/graphQuery.js" },

      };


    } catch (_e) {

      return {};

    }


}

function lazyRequire(agentKey) {


  try {

      const map = {


        squareAgent: () => require("./squareAgent"),


        emailAgent: () => require("./emailAgent"),


        productionAgent: () => require("./productionAgent"),

        memoryAgent: () => require("./memoryAgent"),


        diagnosticsAgent: () => require("./diagnosticsAgent"),


        planningAgent: () => require("./planningAgent"),

      };

      const fn = map[String(agentKey || "")];

      return fn ? fn() : null;

    } catch (_e) {

      return null;

    }

}

module.exports = {

  snapshot,

  lazyRequire,

};
