"use strict";

/**
 * Normalize operator utterances → intent + naive entity extraction (no ML).
 */


function normalizeText(s) {


  try {

      return String(s || "").trim();


    } catch (_e) {

      return "";

    }

}


/**

 * @returns {{ text:string, intent:string, entities: object }}

 */

function parseSpokenCommand(raw) {


  try {

      const text = normalizeText(raw).replace(/\s+/g, " ");

      const lowered = text.toLowerCase();


      let intent = "unknown";


      if (/unpaid invoice|past due invoice|open invoice\b/.test(lowered)) {


        intent = "square_collections";

      } else if (/revenue|how much\b/.test(lowered) && !/estimate/.test(lowered)) {

        intent = "square_revenue";

      } else if (/late job|jobs are late|overdue\b/.test(lowered)) {


        intent = "production_lateness";


      } else if (/summarize production|production summary|floor status\b/.test(lowered)) {

        intent = "production_summary";

      } else if (/inbox|email last|recent email\b/.test(lowered)) {

        intent = "email_touch";

      } else if (/processor|queue integrity|audit trail\b/.test(lowered)) {

        intent = "diagnostics_health";

      } else if (/similar task|prior build|prior fix|memory\b/.test(lowered)) {


        intent = "memory_retrieval";

      } else if (/graph neighbor|relationship|who is linked\b/.test(lowered)) {


        intent = "graph_lookup";

      } else if (/increase .*sales|growth goal|prioritize\b/.test(lowered)) {


        intent = "planning_goal";

      }



      /** @type {Record<string,string>} */


      const entities = {};



      let m;



      if ((m = lowered.match(/\border[: ]+([a-z0-9-]{4,})\b/i))) entities.orderId = m[1];


      if ((m = lowered.match(/\bcustomer[: ]+([^,]+)/i))) entities.customer = m[1].trim();


      if ((m = lowered.match(/\binvoice[: ]+([a-z0-9-]{4,})\b/i))) entities.invoiceId = m[1];


      if ((m = lowered.match(/\btask[: ]+([a-z0-9-]{4,})\b/i))) entities.taskId = m[1];


      return { text, intent, entities };

    } catch (_e) {

      return { text: "", intent: "unknown", entities: {} };

    }

}


module.exports = {

  normalizeText,

  parseSpokenCommand,

};
