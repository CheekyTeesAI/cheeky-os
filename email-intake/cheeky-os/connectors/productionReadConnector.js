"use strict";

/**
 * Production / job intelligence from local JSON + optional Prisma (read-only).

 * Never mutates underlying records.

 */


const fs = require("fs");


const path = require("path");


const taskQueue = require("../agent/taskQueue");

const REPO_DATA = path.join(__dirname, "..", "..", "..", "data");


function readJsonSafe(fp) {


  try {




      if (!fs.existsSync(fp)) return null;



      return JSON.parse(fs.readFileSync(fp, "utf8"));

    } catch (_e) {


      return null;

    }


}

function loadJobsRows() {


  try {

      const fp = path.join(REPO_DATA, "cheeky-jobs.json");


      const j = readJsonSafe(fp);


      if (Array.isArray(j)) return { rows: j, path: fp };

      if (j && typeof j === "object" && Array.isArray(j.jobs)) return { rows: j.jobs, path: fp };

      return { rows: [], path: fp };


    } catch (_e) {

      return { rows: [], path: path.join(REPO_DATA, "cheeky-jobs.json") };


    }


}

function getPrisma() {


  try {

      return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));


    } catch (_e) {


      return null;

    }


}

function orchestrationApproved() {


  try {

      return taskQueue.getApprovedTasks().length;


    } catch (_e) {


      return 0;

    }


}

function orchestrationRunning() {


  try {




      const all = taskQueue.readAllTasksSync();


      return all.filter((t) => String(t.status) === "running").length;



    } catch (_e) {

      return 0;


    }


}

function getProductionQueue() {


  try {





      const { rows } = loadJobsRows();


      const orch = {


        approved: orchestrationApproved(),


        running: orchestrationRunning(),


      };


      return {


        ok: true,

        cheekyJobs: rows.length,

        orchestrationTasks: orch,


        preview: rows.slice(0, 40),



      };


    } catch (_e) {

      return {


        ok: false,

        cheekyJobs: 0,

        orchestrationTasks: {},

        preview: [],

      };


    }


}

function parseJobDue(row) {


  try {


      const ds = row.dueDate || row.due || row.needsBy || row.deadline;


      const t = ds ? new Date(String(ds)).getTime() : NaN;


      return Number.isFinite(t) ? t : NaN;


    } catch (_e) {


      return NaN;

    }


}

function getLateJobs() {


  try {






      const { rows } = loadJobsRows();


      const now = Date.now();


      const late = rows.filter((r) => {



        try {





            const t = parseJobDue(r);


            return Number.isFinite(t) && t < now;



          } catch (_eRow) {


            return false;

          }



      });


      return { ok: true, count: late.length, preview: late.slice(0, 80) };


    } catch (_e) {


      return {


        ok: false,

        count: 0,

        preview: [],



      };


    }


}

async function prismaWaitingOnDeposit(limit) {


  try {






      const prisma = getPrisma();


      if (!prisma || !prisma.order) return { ok: true, prismaAvailable: false, rows: [], source: null };

      const n = Math.min(120, Math.max(1, Number(limit) || 60));

      const rows = await prisma.order.findMany({


        where: {


          deletedAt: null,

          depositPaidAt: null,

          status: {


            notIn: ["COMPLETED", "CANCELLED", "PICKED_UP", "SHIPPED"],



          },

        },


        take: n,

        orderBy: { updatedAt: "desc" },

        select: {


          id: true,


          orderNumber: true,


          customerName: true,



          email: true,



          status: true,


          quotedAmount: true,


          totalAmount: true,


          updatedAt: true,


          amountPaid: true,


        },

      });


      const filtered = rows.filter((o) => {


        try {


            const amt =



              Number(o.totalAmount ?? 0) || Number(o.quotedAmount ?? 0) || Number(o.amountPaid ?? 0);



            return amt > 0;


          } catch (_eR) {


            return false;

          }



      });


      return { ok: true, prismaAvailable: true, rows: filtered, source: "prisma" };


    } catch (_e) {

      return {


        ok: true,

        prismaAvailable: false,


        rows: [],



        source: "prisma_error",

      };


    }


}

async function jobsWaitingDepositHeuristic(limit) {
  try {
    const { rows } = loadJobsRows();
    const n = Math.min(120, Number(limit) || 60);
    const out = [];
    const seen = new Set();
    rows.forEach((r) => {
      try {
        const hay = `${r.stage || ""} ${r.status || ""} ${r.note || ""}`.toLowerCase();
        const hit =
          /awaiting\s+deposit|needs\s+deposit|waiting\s+on\s+deposit/.test(hay) ||
          (/\bdeposit\b/.test(hay) && !/\bdeposit\s*(paid|received|complete)\b/.test(hay));
        if (!hit) return;
        const key = String(r.id || r.orderId || r.title || hay.slice(0, 40));
        if (seen.has(key)) return;
        seen.add(key);
        out.push(r);
      } catch (_e2) {}
    });
    return { rows: out.slice(0, n), source: "cheeky-jobs-json" };
  } catch (_e) {
    return { rows: [], source: "none" };
  }
}

async function getWaitingOnDeposit() {


  try {





      const p = await prismaWaitingOnDeposit(80);


      if (p.prismaAvailable && p.rows && p.rows.length) {


        return { ok: true, source: "prisma", preview: p.rows };


      }



      const h = await jobsWaitingDepositHeuristic(80);


      return {


        ok: true,


        source: h.source,


        preview: h.rows,


        prismaFallback: !(p.rows && p.rows.length),



      };


    } catch (_e) {


      return {


        ok: false,

        preview: [],


      };


    }


}

function missingArtPredicate(row) {


  try {


      const hay = `${JSON.stringify(row || {})}`.toLowerCase();

      /** flag when obvious art placeholders */

      const hasArtFlag = !!(row.artUrl || row.art || row.artFile || row.assets || row.proofUploaded);

      if (hasArtFlag) return false;

      return /needs art|missing art|art pending|proof needed| awaiting art/.test(hay);


    } catch (_e) {


      return false;

    }


}

function getMissingArt() {


  try {






      const { rows } = loadJobsRows();


      const miss = rows.filter(missingArtPredicate);


      return { ok: true, count: miss.length, preview: miss.slice(0, 60) };


    } catch (_e) {


      return {


        ok: false,

        count: 0,

        preview: [],

      };


    }


}

function inventoryLowThumb(threshold) {


  try {




      const fp = path.join(REPO_DATA, "inventory.json");


      const blob = readJsonSafe(fp);


      const items = blob && Array.isArray(blob.items) ? blob.items : [];

      const th = Number(threshold);

      const cut = Number.isFinite(th) && th > 0 ? th : 12;

      /** @type {object[]} */


      const low = [];

      items.forEach((it) => {






          try {


              const qty = Number(it.qtyOnHand != null ? it.qtyOnHand : it.quantity);

              if (Number.isFinite(qty) && qty < cut) low.push(it);


            } catch (_eI) {}



        });


      return { lowBlanksPreview: low.slice(0, 40), threshold: cut };

    } catch (_e) {





      return { lowBlanksPreview: [], threshold: threshold || 12 };


    }


}

async function getMissingBlanks(limit) {


  try {






      const { rows } = loadJobsRows();

      /** @type {object[]} */


      const miss = [];

      const inv = inventoryLowThumb(12);

      rows.forEach((r) => {



        try {





            const t = `${r.stage || ""} ${r.status || ""} ${r.note || ""}`.toLowerCase();


            if (/blank|shirt|shirt order|sizes|ordering garment|supplier/.test(t)) {


              miss.push(Object.assign({}, r, { inventoryHintRows: inv.lowBlanksPreview.length }));

            }



          } catch (_eRow) {}



      });


      const n = Math.min(100, Number(limit) || 50);


      return {


        ok: true,


        count: miss.length,


        preview: miss.slice(0, n),

        inventoryLowSignals: inv,


      };


    } catch (_e) {

      return {


        ok: false,

        preview: [],

      };


    }


}

async function getTodaysPriorityList(limit) {


  try {






      const late = await getLateJobs();


      const dep = await getWaitingOnDeposit();


      const art = getMissingArt();

      /** @type {object[]} */


      const merged = [];

      (late.preview || []).slice(0, 25).forEach((j) =>
        merged.push({ reason: "late_job", ref: j.id || j.orderId || j.title || "(job)", severity: "high" })
      );

      (dep.preview || []).slice(0, 25).forEach((j) =>
        merged.push({
          reason: "waiting_on_deposit",
          ref: j.orderNumber || j.id || j.customerName || "(order)",
          severity: "high",
        })
      );


      (art.preview || []).slice(0, 15).forEach((j) =>
        merged.push({
          reason: "missing_art",
          ref: String(j.title || j.id || "job"),

          severity: "medium",

        })
      );


      const n = Math.min(120, Number(limit) || 40);


      return {


        ok: true,

        items: merged.slice(0, n),

        summary: {


          late: late.count,


          waitingDepositApprox: Array.isArray(dep.preview) ? dep.preview.length : 0,


          missingArt: art.count,


        },


      };


    } catch (_e) {


      return {


        ok: false,

        items: [],

      };


    }


}



module.exports = {


  getProductionQueue,



  getLateJobs,





  getWaitingOnDeposit,





  getMissingArt,





  getMissingBlanks,




  getTodaysPriorityList,


};

