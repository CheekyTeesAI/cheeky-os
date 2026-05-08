"use strict";

const parser = require("./operatorCommandParser");

const delegationEngine = require("../subagents/delegationEngine");

const semanticTaskEngine = require("../memory/semanticTaskEngine");

const graphQuery = require("../graph/graphQuery");

const recommendationEngine = require("../planning/recommendationEngine");

/**

 * Route normalized voice intents to specialized read-only stacks.

 */

function routeParsedCommand(parsed) {

  try {

      const sel = delegationEngine.pickAgentForParsed(parsed);



      /** @type {object} */


      let moduleResult = {};

      let channel = sel.selectedAgent;



      switch (channel) {


        case "squareAgent": {


          try {

              const sq = require("../subagents/squareAgent");

              if (/collection|unpaid|invoice/.test(String(parsed.intent))) {

                moduleResult = sq.unpaidInvoiceHint();


              } else if (/revenue/.test(String(parsed.intent))) {

                moduleResult = sq.revenueFingerprint();


              } else {

                moduleResult = sq.ordersSummary(12);

              }

            } catch (_eSq) {


              moduleResult = { readonly: true, error: "square_module_failed" };

            }




          break;

        }



        case "emailAgent": {

          try {


              const mail = require("../subagents/emailAgent");


              moduleResult = mail.searchInbox({ query: parsed.entities.customer || "", limit: 24 });


            } catch (_em) {


              moduleResult = { readonly: true, error: "email_module_failed" };

            }




          break;

        }



        case "productionAgent": {

          try {


              const pr = require("../subagents/productionAgent");


              moduleResult =

                parsed.intent === "production_lateness" ? pr.overdueJobs(40) : pr.loadAnalysis();


            } catch (_ep) {

              moduleResult = { readonly: true, error: "production_module_failed" };

            }




          break;

        }



        case "memoryAgent": {

          try {




              moduleResult = semanticTaskEngine.generateTaskContext({

                intent: String(parsed.intent),


                target: parsed.text,


                requirements: Object.keys(parsed.entities || {}),

              });


            } catch (_eM) {


              moduleResult = { success: false, contextLines: [] };

            }



          break;



        }



        case "planningAgent": {

          try {


              moduleResult = recommendationEngine.recommendFromGoal(parsed.text);


            } catch (_p) {


              moduleResult = { success: false };

            }




          break;

        }



        case "diagnosticsAgent": {


          try {





              moduleResult = require("../subagents/diagnosticsAgent").describe();


            } catch (_d) {





              moduleResult = { readonly: true };

            }



          break;

        }



        case "graphQuery": {

          try {

              const entityRegistry = require("../graph/entityRegistry");

              const p = parsed && parsed.entities ? parsed.entities : {};

              let centerId = "";

              if (p.orderId) centerId = entityRegistry.makeEntityId("order", p.orderId);

              else if (p.invoiceId) centerId = entityRegistry.makeEntityId("invoice", p.invoiceId);

              else if (p.taskId) centerId = entityRegistry.makeEntityId("task", p.taskId);

              moduleResult = centerId


                ? graphQuery.dependencySummary(centerId, 3)

                : { success: false, note: "no_entity_anchor — say order TASK-..., invoice ..., or task ...", readonly: true };

            } catch (_g) {


              moduleResult = { success: false, readonly: true, error: "graph_module_failed" };

            }



          break;

        }



        default: {


          channel = channel || "diagnosticsAgent";


          try {


              moduleResult = require("../subagents/diagnosticsAgent").describe();


            } catch (_d2) {

              moduleResult = {};

            }

        }

      }



      return {

        success: true,

        channel,

        delegation: sel,

        parser: parsed,

        moduleResult,

      };

    } catch (_e) {

      return {

        success: false,

        channel: "none",

        delegation: null,

        parser: parsed || { intent: "unknown", entities: {} },

        moduleResult: {},

      };

    }

}


function routeFromPhrase(raw) {


  try {

      const parsed = parser.parseSpokenCommand(raw);


      return routeParsedCommand(parsed);

    } catch (_e) {

      return {


        success: false,

        channel: "none",

        delegation: null,

        parser: { intent: "unknown", text: "", entities: {} },

        moduleResult: {},

      };


    }

}


module.exports = {

  routeParsedCommand,

  routeFromPhrase,

};
