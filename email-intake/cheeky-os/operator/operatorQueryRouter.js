"use strict";

const graphEmailConnector = require("../connectors/graphEmailConnector");

const squareReadConnector = require("../connectors/squareReadConnector");

const productionReadConnector = require("../connectors/productionReadConnector");

const semanticTaskEngine = require("../memory/semanticTaskEngine");

const recommendationEngine = require("../planning/recommendationEngine");

function extractPersonName(question) {

  try {

    const q = String(question || "").trim();


    let m;


    if ((m = q.match(/^what did ([A-Za-z][A-Za-z'\-]{1,48})'?s\b/i))) return m[1].trim();

    if ((m = q.match(/\blast (?:email|message) from ([A-Za-z][A-Za-z'\-\s]{1,48})\b/i))) return m[1].trim().split(/\s+/).slice(0, 3).join(" ");

    if ((m = q.match(/(?:from|with|named|called)\s+([A-Za-z][A-Za-z'\-\s]{1,48})(?:\?|$)/i)))

      return m[1].trim().split(/\s+/).slice(0, 3).join(" ");


    return "";

  } catch (_e) {


    return "";


  }


}

/**

 * @param {{ query: string, requestedBy?: string }} payload

 */


async function routeOperatorQuery(payload) {


  try {




      const q = String(payload && payload.query ? payload.query : "").trim();


      if (!q) {


        return {

          success: false,

          intent: "empty",

          confidence: 0,

          answer: "",

          sources: [],

          recommendedNextAction: "",

          error: "empty_query",

        };


      }



      const low = q.toLowerCase();

      const sources = [];

      let intent = "general";

      /** @type {string} */


      let answer = "";

      let confidence = 0.62;

      let recommendedNextAction = "";

      /** memory / builds */







      if (/\bmemory\b|prior build|lesson learned|same failure|architecture history|repeat/i.test(low)) {


        intent = "memory.semantic";


        sources.push({ type: "memory", connector: "semanticTaskEngine", readOnly: true });


        const rel = semanticTaskEngine.generateTaskContext({ intent: "ops", target: q, requirements: [] });

        confidence = rel.success ? 0.71 : 0.45;


        answer = rel.success



          ? (rel.contextLines && rel.contextLines.length ? rel.contextLines.join(" \n ") : "No strong memory hits yet.") +



            (



              rel.topSignals &&



              rel.topSignals[0]


                ? `\n(signal score ${rel.topSignals[0].score})`


                : ""


            )



          : "Semantic memory unavailable or empty.";





        recommendedNextAction =




          "Link this question to an approved orchestration task if you want persisted memory indexing.";





        return { success: true, intent, confidence, answer, sources, recommendedNextAction };


      }



      /** email */




      if (


        /\b(email|mailbox|said|message from|did .* write|touchpoint|respond|inbox)\b/i.test(low) ||


        /\blast email\b/i.test(low)


      ) {


        intent = "email.last_contact_or_search";





        sources.push({ type: "mailbox", connector: "graphEmailConnector", readOnly: true });





        const name = extractPersonName(q);


        if (!graphEmailConnector.isConfigured()) {


          confidence = 0.95;


          answer =
            "Mailbox intelligence is offline because Microsoft Graph env vars are not fully configured.";


          recommendedNextAction = "Set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, MS_GRAPH_MAILBOX_USER (read scopes).";


          return {


            success: true,


            intent,


            confidence,


            answer,


            sources,


            recommendedNextAction,


          };


        }


        let pack;


        if (name) {


          pack = await graphEmailConnector.getLastEmailFromContact(name);


          confidence = pack.matched ? 0.82 : 0.55;


          if (pack && pack.email && pack.summary) {


            const s = pack.summary;


            answer = `${name}: last inbound snippet — Subject: "${s.subject || ""}" — From ${s.fromName || "?"} <${
              s.fromAddress || ""
            }> — Received ${s.receivedDateTime || ""}. Preview: ${(s.preview || "").slice(0, 560)}`;

          } else {


            answer =
              `${name}: no qualifying recent inbound match found in Graph window (still read-only; no mail mutation).`;

          }


        } else {


          pack = await graphEmailConnector.searchEmails(q.slice(0, 120), { limit: 5 });


          confidence = pack.ok ? 0.74 : 0.4;


          if (pack.ok && pack.messages && pack.messages.length) {


            const snippets = pack.messages


              .map((m) => graphEmailConnector.summarizeEmail(m))


              .map((s) => `• "${s.subject}" (${s.fromAddress}) — ${String(s.preview).slice(0, 180)}`)

              .join("\n");


            answer = `Top mailbox matches:\n${snippets}`;


          } else {


            answer = "No Graph email matches surfaced for that text (mailbox read-only path).";


          }


        }



        recommendedNextAction =




          name


            ? `If ambiguous, rerun with full email domain or tighten spelling for ${name}.`


            : "Add `contact=name` intent by including `from Jessica` pattern or use `/api/intelligence/email/last-contact`.";



        return { success: true, intent, confidence, answer, sources, recommendedNextAction };


      }

      /** Square / cash */






      if (


        /\b(unpaid|invoice|deposit|square|estimate|balance|owe|past due|collections|cash|money|paid|payments|who owes)\b/i.test(



          low


        )


      ) {


        intent = "square.financial_read";







        sources.push({ type: "square", connector: "squareReadConnector", readOnly: true });


        const rd = await squareReadConnector.readiness();


        if (!rd.authVerified || !rd.locationId) {


          confidence = 0.9;


          answer = `Square intelligence is unavailable: ${rd.error || "not_ready"} (still read-only; no mutations attempted).`;

          recommendedNextAction =


            "Verify SQUARE_ACCESS_TOKEN / SQUARE_LOCATION_ID and rerun after integration shows READY.";


          return { success: true, intent, confidence, answer, sources, recommendedNextAction };

        }



        /** Composite answer for unpaid question */






        if (/\bwho\b.*unpaid|\bunpaid invoice/i.test(low)) {


          const unpaid = await squareReadConnector.findUnpaidInvoices();


          confidence = unpaid.ok ? 0.81 : 0.45;


          if (unpaid.ok && unpaid.items && unpaid.items.length) {


            answer = unpaid.items


              .slice(0, 12)


              .map(


                (u) =>
                  `- ${String(u.invoiceId || "").slice(0, 14)} (${u.status}) title=${JSON.stringify(u.title)} cents=${





                    u.computedDueCents || ""





                  }`


              )


              .join("\n");


          } else {


            answer = unpaid.ok


              ? "No unpaid-pattern invoices surfaced in the current Square search slice (still read-only)."


              : `Unable to list invoices: ${unpaid.error || "error"}`;



          }


          recommendedNextAction =




            "Escalate to finance review in Square Dashboard for authoritative truth; connector is read-only.";



          return {


            success: true,


            intent,


            confidence,


            answer,


            sources,


            recommendedNextAction,

          };


        }



        /** revenue wording */






        if (/\brevenue\b/i.test(low) && /\b(payments|pulse|recent|week|cash)\b/i.test(low)) {


          const rv = await squareReadConnector.getRevenueSnapshot(7);


          intent = "square.revenue_snapshot";





          confidence = rv.ok ? 0.78 : 0.41;





          answer = rv.ok


            ? `Approx net completed payments sampled (7d window): USD ${rv.totalUsd} across ${rv.paymentCount} rows (minor-unit sums best-effort).`


            : `Square revenue snapshot unavailable: ${rv.error || "error"}`;



          recommendedNextAction = "Cross-check totals with Square Payments report for audit-grade numbers.";





          return { success: true, intent, confidence, answer, sources, recommendedNextAction };


        }

        /** fallback square answer */






        const pay = await squareReadConnector.listRecentPayments(14);





        intent = "square.recent_activity";





        confidence = pay.ok ? 0.66 : 0.35;





        answer = pay.ok


          ? `Recent Square payments (${pay.payments.length} rows fetched, 14d window).`


          : `Unable to fetch payments: ${pay.error || ""}`;



        recommendedNextAction =




          "Use Square Dashboard for definitive payment status; connector never mutates invoices.";





        return { success: true, intent, confidence, answer, sources, recommendedNextAction };

      }



      /** production */





      if (


        /\b(late|jobs|floor|production|blanks|art|deposit|rush|embroider|qc|shirt)\b/i.test(low) ||

        /\bjobs are late\b/i.test(low)


      ) {


        intent = "production.read";





        sources.push({ type: "production", connector: "productionReadConnector", readOnly: true });

        if (/\blate\b/.test(low) && /\bjob\b/.test(low)) {


          const j = await productionReadConnector.getLateJobs();


          confidence = j.ok ? 0.76 : 0.4;


          answer =
            `Late jobs heuristic: ${j.count} flagged. Snapshot: ${JSON.stringify(j.preview.slice(0, 3))}`.slice(


              0,


              1800



            );


          recommendedNextAction =


            "Open production board and confirm floor truth; connector uses local cheeky-jobs/prisma snapshots only.";





          return { success: true, intent, confidence, answer, sources, recommendedNextAction };

        }



        /** focus today wording */






        if (/\b(today|focus|prioritize|prio)\b/i.test(low)) {


          const tl = await productionReadConnector.getTodaysPriorityList(30);





          intent = "production.today_priorities";





          confidence = tl.ok ? 0.74 : 0.38;





          answer =
            tl.ok


              ? `Today's composite priority (${tl.items.length} items): ${JSON.stringify(tl.items.slice(0, 10))}`


              : "Could not derive today's priority composite.";





          recommendedNextAction =


            "Reconcile priorities with orchestration approvals and CRM touchpoints.";


          return { success: true, intent, confidence, answer, sources, recommendedNextAction };

        }



        /** waiting deposit */






        if (/\bdeposit\b/.test(low) && /\b(wait|without|needs|waiting)\b/i.test(low)) {


          const w = await productionReadConnector.getWaitingOnDeposit();





          intent = "production.waiting_deposit";





          confidence = 0.7;





          answer = `Approx waiting-on-deposit list (source=${w.source}) count=${




            Array.isArray(w.preview) ? w.preview.length : 0


          }: ${JSON.stringify((w.preview || []).slice(0, 8))}`;



          recommendedNextAction =


            "Square + production systems differ—verify deposit state in Square invoices before quoting customers.";





          return {


            success: true,


            intent,


            confidence,


            answer,


            sources,


            recommendedNextAction,

          };


        }



        /** default production surface */






        const queue = productionReadConnector.getProductionQueue();


        confidence = queue.ok ? 0.62 : 0.35;


        answer =
          queue.ok




            ? `Production queue skim — cheekyJobs=${queue.cheekyJobs}, orchestration approved=${




                queue.orchestrationTasks.approved




              }: preview=${JSON.stringify(queue.preview.slice(0, 6))}`


            : "Production queue unreadable.";





        recommendedNextAction =


          "Use GET /api/intelligence/production/late or /waiting-on-deposit for tighter slices.";


        return { success: true, intent, confidence, answer, sources, recommendedNextAction };

      }



      /** planning fallback */






      intent = "planning.fallback";


      sources.push({ type: "planning", connector: "recommendationEngine", readOnly: true });


      const rec = recommendationEngine.recommendFromGoal(q);





      confidence = rec.success ? 0.54 : 0.35;


      answer =
        rec.success && rec.recommendations && rec.recommendations.length


          ? rec.recommendations


              .slice(0, 5)


              .map((r, i) => `${i + 1}. (${r.rank}) ${r.task.target || r.task.intent}`)


              .join("\n")


          :


            "Planning engine returned no actionable recommendation text (still read-only).";



      recommendedNextAction =
        "Approve a generated orchestration task if you want autonomous execution downstream.";





      return {


        success: true,


        intent,


        confidence,


        answer,


        sources,


        recommendedNextAction,


      };

    } catch (e) {

      return {


        success: false,



        intent: "error",

        confidence: 0,



        answer: "",

        sources: [],


        recommendedNextAction: "",

        error: e.message || String(e),



      };


    }



}


module.exports = {

  routeOperatorQuery,

  extractPersonName,

};

