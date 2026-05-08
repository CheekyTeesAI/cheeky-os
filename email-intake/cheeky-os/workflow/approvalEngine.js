"use strict";

const crypto = require("crypto");

const fs = require("fs");

const path = require("path");

const taskQueue = require("../agent/taskQueue");

const policies = require("./approvalPolicies");

const APPROVALS_FILE = path.join(taskQueue.DATA_DIR, "approvals.jsonl");

function isoNow() {
  try {
    return new Date().toISOString();
  } catch (_e) {
    return new Date().toISOString();
  }
}

function newId() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `apr-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  } catch (_e) {
    return `apr-${Date.now()}`;
  }
}

function appendRow(row) {
  try {
    taskQueue.ensureDirAndFiles();
    fs.appendFileSync(APPROVALS_FILE, `${JSON.stringify(row)}\n`, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/**
 * Latest snapshot wins per approvalId (append-only JSONL).
 *

 * @returns {Map<string, object>}


 */







function snapshotsByApprovalId() {


  try {




      taskQueue.ensureDirAndFiles();


      if (!fs.existsSync(APPROVALS_FILE)) return new Map();


      const mp = new Map();


      fs.readFileSync(APPROVALS_FILE, "utf8")


        .split(/\r?\n/)


        .forEach((ln) => {


          if (!ln || !ln.trim()) return;


          try {


            const o = JSON.parse(ln);


            if (!o || !o.approvalId) return;


            mp.set(String(o.approvalId), o);


          } catch (_eP) {}



        });


      return mp;


    } catch (_e) {




      return new Map();


    }


}




function latestApprovalsSorted(limit) {


  try {






      const arr = Array.from(snapshotsByApprovalId().values());


      arr.sort((a, b) => String(b.requestedAt || "").localeCompare(String(a.requestedAt || "")));


      const n = Math.min(800, Math.max(1, Number(limit) || 200));


      return arr.slice(0, n);


    } catch (_e) {




      return [];


    }


}





/**

 * Upsert-ish: create base pending row.


 */





function createApprovalRequest(spec) {


  try {






      const s = spec || {};




      const taskId = String(s.taskId || "").trim();





      if (!taskId) return { ok: false, error: "missing_task_id" };




      const classified =




        policies.classifyTask(taskQueue.getTaskById(taskId) || { intent: "", target: "", requirements: [], priority: "" });




      const approvalId = newId();


      const row = {


        approvalId,


        taskId,





        category: s.category ? String(s.category) : classified.category,


        riskLevel: s.riskLevel ? String(s.riskLevel) : classified.riskLevel,


        requestedBy: String(s.requestedBy || "system").slice(0, 160),

        status: "pending",


        requestedAt: isoNow(),


        approvedAt: null,


        rejectedAt: null,

        actor: null,





        reason: s.reason ? String(s.reason).slice(0, 640) : null,





        workflowRequired: !!(classified.workflowRequired || s.workflowRequired),

      };


      const w = appendRow(row);





      return w.ok ? { ok: true, approval: row } : { ok: false, error: w.error };


    } catch (e) {




      return { ok: false, error: e.message || String(e) };


    }


}





/**

 * Bridge task-queue approval aligns workflow ledger.


 */






function approvePendingForTask(taskId, actor) {


  try {






      const id = String(taskId || "").trim();


      if (!id) return { ok: false };


      /** find latest pending for task */






      let hit = null;


      snapshotsByApprovalId().forEach((row) => {


        try {


            if (String(row.taskId) === id && String(row.status) === "pending") hit = row;


          } catch (_e) {}



      });


      if (!hit) {


        /** synthesize passive approval ledger row so gate passes */






        const t = taskQueue.getTaskById(id);





        const c =




          policies.classifyTask(t || {


            intent: "unknown",





            target: "",


            requirements: [],

            priority: "normal",

          });


        const row = {


          approvalId: newId(),


          taskId: id,





          category: c.category,

          riskLevel: c.riskLevel,


          requestedBy: "bridge_implicit",





          status: "approved",





          requestedAt: isoNow(),


          approvedAt: isoNow(),


          rejectedAt: null,





          actor: String(actor || "bridge").slice(0, 160),

          reason: "bridge_queue_approve",


          workflowRequired: c.workflowRequired,


        };


        appendRow(row);


        return { ok: true, approval: row, mode: "synthetic_bridge_latch" };


      }







      const next = Object.assign({}, hit, {




        status: "approved",





        approvedAt: isoNow(),


        rejectedAt: null,

        actor: String(actor || "operator").slice(0, 160),





        reason: hit.reason,

      });


      appendRow(next);


      return { ok: true, approval: next };


    } catch (_e) {






      return { ok: false };


    }


}




function approveRequest(approvalId, actor) {


  try {






      const id = String(approvalId || "").trim();


      const cur = snapshotsByApprovalId().get(id);


      if (!cur) return { ok: false, error: "approval_not_found" };


      if (String(cur.status) !== "pending") return { ok: false, error: `invalid_status:${cur.status}` };


      const next = Object.assign({}, cur, {


        status: "approved",





        approvedAt: isoNow(),


        rejectedAt: null,

        actor: String(actor || "operator").slice(0, 160),

      });


      const w = appendRow(next);


      return w.ok ? { ok: true, approval: next } : { ok: false, error: w.error };


    } catch (e) {






      return { ok: false, error: e.message || String(e) };


    }


}





function rejectRequest(approvalId, actor, reason) {


  try {






      const id = String(approvalId || "").trim();


      const cur = snapshotsByApprovalId().get(id);





      if (!cur) return { ok: false, error: "approval_not_found" };




      const next = Object.assign({}, cur, {


        status: "rejected",

        rejectedAt: isoNow(),




        actor: String(actor || "operator").slice(0, 160),





        reason: reason != null ? String(reason).slice(0, 640) : cur.reason,

      });


      const w = appendRow(next);


      return w.ok ? { ok: true, approval: next } : { ok: false, error: w.error };


    } catch (e) {




      return { ok: false, error: e.message || String(e) };


    }


}





function getPendingApprovals() {


  try {


      const out = [];


      snapshotsByApprovalId().forEach((row) => {


        try {


            if (String(row.status) === "pending") out.push(row);


          } catch (_e) {}



      });


      out.sort((a, b) => String(a.requestedAt || "").localeCompare(String(b.requestedAt || "")));


      return out;


    } catch (_e) {




      return [];


    }


}





function getApprovalHistory(limit) {


  try {






      const raw = [];


      if (!fs.existsSync(APPROVALS_FILE)) return [];


      fs.readFileSync(APPROVALS_FILE, "utf8")


        .split(/\r?\n/)


        .forEach((ln) => {


          if (!ln || !ln.trim()) return;


          try {


            raw.push(JSON.parse(ln));


          } catch (_eP) {}



        });


      const n = Math.min(2500, Math.max(10, Number(limit) || 200));


      return raw.slice(-n);





    } catch (_e) {




      return [];


    }


}





/**

 * Gate BEFORE runTask() — fail closed.


 */






function verifyExecutionAllowed(taskObj) {


  try {






      const t = taskObj && typeof taskObj === "object" ? taskObj : {};


      const taskId = String(t.taskId || "").trim();


      if (!taskId) return { allowed: false, reason: "missing_task_id" };




      const klass = policies.classifyTask(t);





      /** Query intent alone with low tier → bridge approval enough */






      if (!klass.workflowRequired) {




        return { allowed: true, reason: "workflow_not_required_under_policy", category: klass.category };


      }







      /** Need evidence of approved ledger row anchored to task */






      let approvedSeen = false;


      snapshotsByApprovalId().forEach((row) => {


        try {


            if (String(row.taskId) !== taskId) return;


            if (String(row.status) === "approved") approvedSeen = true;


          } catch (_eR) {}



      });


      if (!approvedSeen) {


        return {


          allowed: false,


          reason: "workflow_approval_missing_not_approved",


          category: klass.category,

          riskLevel: klass.riskLevel,





        };


      }


      return { allowed: true, reason: "workflow_approved_snapshot_present", category: klass.category };


    } catch (_e) {




      return { allowed: false, reason: "verify_threw_fail_closed" };


    }


}




/** Invoke after enqueue for gated tasks */


function ensurePendingRequestForTask(task, requestedBy, riskAssessment) {


  try {






      const klass = policies.classifyTask(task);


      if (!klass.workflowRequired) return { ok: true, skipped: true };




      let hasPendingOrApproved = false;


      snapshotsByApprovalId().forEach((row) => {


        try {


            if (String(row.taskId) !== String(task.taskId)) return;





            if (String(row.status) === "pending" || String(row.status) === "approved") hasPendingOrApproved = true;


          } catch (_e) {}



      });


      if (hasPendingOrApproved) return { ok: true, skipped: true };


      return createApprovalRequest({
        taskId: task.taskId,


        requestedBy: requestedBy || task.requestedBy,


        reason:



          riskAssessment && Array.isArray(riskAssessment.reasons)


            ? riskAssessment.reasons.join(",")


            : "risk_policy_auto",
      });


    } catch (e) {




      return { ok: false, error: e.message || String(e) };


    }


}





module.exports = {


  APPROVALS_FILE,


  createApprovalRequest,

  approveRequest,


  rejectRequest,


  getPendingApprovals,


  getApprovalHistory,


  verifyExecutionAllowed,

  snapshotsByApprovalId,


  approvePendingForTask,


  ensurePendingRequestForTask,


};

