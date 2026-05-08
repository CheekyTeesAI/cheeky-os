"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const TASK_QUEUE_FILE = path.join(DATA_DIR, "task-queue.jsonl");
const CORRUPT_QUARANTINE = path.join(DATA_DIR, "corrupted-task-lines.jsonl");

const JSONL_TOUCH = [
  TASK_QUEUE_FILE,
  path.join(DATA_DIR, "agent-run-log.jsonl"),
  path.join(DATA_DIR, "notifications.jsonl"),
  path.join(DATA_DIR, "events.jsonl"),
  path.join(DATA_DIR, "audit-trail.jsonl"),
  path.join(DATA_DIR, "transport-log.jsonl"),
  path.join(DATA_DIR, "task-memory.jsonl"),
  CORRUPT_QUARANTINE,
  path.join(DATA_DIR, "events-expanded.jsonl"),
  path.join(DATA_DIR, "approvals.jsonl"),
];

function ensureDirAndFiles() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    JSONL_TOUCH.forEach((p) => {
      try {
        if (fs.existsSync(p)) return;
        fs.writeFileSync(p, "", "utf8");
      } catch (_e2) {
        /* non-fatal */
      }
    });

    const ratePath = path.join(DATA_DIR, "rate-limit.json");
    try {
      if (!fs.existsSync(ratePath)) {
        fs.writeFileSync(ratePath, JSON.stringify({ executions: [] }, null, 2), "utf8");
      }
    } catch (_e3) {}

    const procPath = path.join(DATA_DIR, "processor-status.json");
    try {
      if (!fs.existsSync(procPath)) {
        fs.writeFileSync(
          procPath,
          JSON.stringify(
            {
              lastTick: null,
              isProcessing: false,
              tasksProcessedToday: 0,
              lastTaskId: null,
            },
            null,
            2
          ),
          "utf8"
        );
      }
    } catch (_e4) {}

    const procLockInit = path.join(DATA_DIR, "processor-lock.json");
    try {
      if (!fs.existsSync(procLockInit)) {
        fs.writeFileSync(
          procLockInit,
          JSON.stringify(
            {
              isProcessing: false,
              taskId: null,
              startedAt: null,
              heartbeat: null,
            },
            null,
            2
          ),
          "utf8"
        );
      }
    } catch (_e5) {}

    const memIdxPath = path.join(DATA_DIR, "task-memory-index.json");
    try {
      if (!fs.existsSync(memIdxPath)) {
        fs.writeFileSync(
          memIdxPath,
          JSON.stringify(
            {
              byTargetSlug: {},
              byTag: {},
              byOutcome: {
                completed: [],
                failed: [],
                rejected: [],
                unknown: [],
              },
              memoryIdsOrdered: [],
              byIntent: {},
              semanticV31: { version: 1, seededAt: new Date().toISOString() },
            },
            null,
            2
          ),
          "utf8"
        );
      }
    } catch (_e6) {}
  } catch (_e) {
    /* non-fatal */
  }
}

ensureDirAndFiles();

function readAllTasksSync() {
  ensureDirAndFiles();
  /** @type {object[]} */
  const out = [];
  try {
    if (!fs.existsSync(TASK_QUEUE_FILE)) return out;
    const raw = fs.readFileSync(TASK_QUEUE_FILE, "utf8");
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (!ln || !ln.trim()) continue;
      try {
        const row = JSON.parse(ln);
        if (row && typeof row === "object" && row.taskId) out.push(row);
      } catch (_parseErr) {
        try {
          const entry = {

            capturedAt: new Date().toISOString(),

            lineIndex: i,

            rawLength: ln.length,

            snippet: ln.slice(0, 280),

            payload: ln,

          };
          fs.appendFileSync(CORRUPT_QUARANTINE, `${JSON.stringify(entry)}\n`, "utf8");
        } catch (_q) {}
      }
    }
  } catch (_e) {
    return [];
  }
  return out;
}

function writeAllTasksSync(tasks) {
  ensureDirAndFiles();
  try {
    const lines = (Array.isArray(tasks) ? tasks : []).map((t) => JSON.stringify(t));
    fs.writeFileSync(TASK_QUEUE_FILE, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function sortByCreatedAsc(a, b) {
  const ca = String(a.createdAt || "");
  const cb = String(b.createdAt || "");
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

function sortByUpdatedDesc(a, b) {

  try {





    const ua = String(a.updatedAt || "");

    const ub = String(b.updatedAt || "");


    return ua < ub ? 1 : ua > ub ? -1 : 0;





  } catch (_e) {




    return 0;





  }


}







function fingerprintForTask(taskObj) {






  try {





    const intent = String(taskObj.intent || "").trim().toLowerCase();





    const target = String(taskObj.target || "").trim().toLowerCase();


    const reqs =



      Array.isArray(taskObj.requirements)


        ? taskObj.requirements




            .map((x) => String(x || "").trim().toLowerCase())




            .sort()


            .join("|")


        : "";





    return `${intent}::${target}::${reqs}`;





  } catch (_e) {






    return `err-fp::${Date.now()}`;




  }


}




function findRecentFingerprintDuplicate(taskObj) {







  try {





    const windowMsRaw = Number(process.env.CHEEKY_TASK_DEDUP_WINDOW_MS || 86400000);





    const windowMs =






      Number.isFinite(windowMsRaw) && windowMsRaw > 0 ? Math.min(30 * 86400000, windowMsRaw) : 86400000;





    const cutoffMs = Date.now() - windowMs;





    const fp = fingerprintForTask(taskObj);





    const tasks = readAllTasksSync();





    const activeSt = {





      pending: true,


      approved: true,





      running: true,







    };








    /** @type {string|null} */






    let matchId = null;








    for (let i = 0; i < tasks.length; i++) {


      try {


          const t = tasks[i];

          if (!t || !t.taskId) continue;

          if (String(t.taskId) === String(taskObj.taskId)) continue;

          if (!activeSt[String(t.status || "").toLowerCase()]) continue;



          const tFp =





            t.executionFingerprint != null




              ? String(t.executionFingerprint)




              : fingerprintForTask(t);





          if (tFp !== fp) continue;







          const tsMs = new Date(String(t.createdAt || t.updatedAt || 0)).getTime();


          if (!Number.isFinite(tsMs)) continue;


          if (tsMs >= cutoffMs) {


            matchId = String(t.taskId);





            break;

          }







        } catch (_eRow) {}






    }






    return matchId




      ? { found: true, matchTaskId: matchId }






      : { found: false };


  } catch (_e) {





    return { found: false };






  }


}




/**
 * @param {object} taskObj full task
 */
function enqueueTask(taskObj) {
  try {
    if (!taskObj || typeof taskObj !== "object" || !taskObj.taskId) {
      return { ok: false, error: "invalid_task_object" };
    }
    const tasks = readAllTasksSync();
    const exists = tasks.some((t) => t.taskId === taskObj.taskId);
    if (exists) {
      return { ok: false, error: "duplicate_task_id" };
    }
    const dup = findRecentFingerprintDuplicate(taskObj);
    if (dup.found) {
      return {
        ok: false,
        error: "duplicate_task_fingerprint_recent",
        fingerprintMatchTaskId: dup.matchTaskId,
      };
    }
    taskObj.executionFingerprint = fingerprintForTask(taskObj);
    tasks.push(taskObj);
    const w = writeAllTasksSync(tasks);
    if (!w.ok) return w;
    return { ok: true, task: taskObj };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function getPendingTasks() {
  try {
    return readAllTasksSync().filter((t) => t.status === "pending").sort(sortByCreatedAsc);
  } catch (_e) {
    return [];
  }
}

function getApprovedTasks() {
  try {
    return readAllTasksSync().filter((t) => t.status === "approved").sort(sortByCreatedAsc);
  } catch (_e) {
    return [];
  }
}

function getTaskById(taskId) {
  try {
    const id = String(taskId || "").trim();
    if (!id) return null;
    return readAllTasksSync().find((t) => t.taskId === id) || null;
  } catch (_e) {
    return null;
  }
}

function upsertTask(taskId, mutator) {
  try {
    const id = String(taskId || "").trim();
    if (!id) return { ok: false, error: "missing_task_id" };
    const tasks = readAllTasksSync();
    const ix = tasks.findIndex((t) => t.taskId === id);
    if (ix < 0) return { ok: false, error: "task_not_found" };
    const next = mutator(Object.assign({}, tasks[ix]));
    if (!next || typeof next !== "object") return { ok: false, error: "mutator_failed" };
    tasks[ix] = next;
    const w = writeAllTasksSync(tasks);
    if (!w.ok) return w;
    return { ok: true, task: next };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function updateTaskStatus(taskId, status, payload) {
  return upsertTask(taskId, (t) => {
    t.status = String(status || t.status);
    t.updatedAt = new Date().toISOString();
    if (payload && typeof payload === "object") {
      Object.keys(payload).forEach((k) => {
        if (k === "taskId") return;
        t[k] = payload[k];
      });
    }
    return t;
  });
}

function markCompleted(taskId, result) {
  return upsertTask(taskId, (t) => {
    t.status = "completed";
    t.result = result !== undefined ? result : null;
    t.completedAt = new Date().toISOString();
    t.updatedAt = t.completedAt;
    t.runningStartedAt = null;
    return t;
  });
}

function markFailed(taskId, errorLog) {
  try {
    const r = upsertTask(taskId, (t) => {
      t.status = "failed";
      t.errorLog = errorLog != null ? String(errorLog) : "unknown_error";
      t.completedAt = new Date().toISOString();
      t.updatedAt = t.completedAt;
      t.runningStartedAt = null;
      return t;
    });
    try {
      const cool = require("../services/taskFailCooldown");
      cool.recordFailure(taskId);
    } catch (_c) {}
    return r;
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

function approveTask(taskId) {
  return upsertTask(taskId, (t) => {
    t.status = "approved";
    t.updatedAt = new Date().toISOString();
    return t;
  });
}

function rejectTask(taskId, reason) {
  return upsertTask(taskId, (t) => {
    t.status = "rejected";
    t.errorLog = reason != null ? String(reason) : "rejected";
    t.completedAt = new Date().toISOString();
    t.updatedAt = t.completedAt;
    return t;
  });
}

/** Move failed → approved so `/rerun` + `/run` gates apply again. */
function reopenFailedTask(taskId) {
  return upsertTask(taskId, (t) => {
    if (String(t.status || "") !== "failed") return t;
    t.status = "approved";
    t.result = null;
    t.completedAt = null;
    t.errorLog = null;
    t.runningStartedAt = null;
    t.updatedAt = new Date().toISOString();
    return t;
  });
}
function getTaskHistory(limit) {
  try {
    const n = Math.min(200, Math.max(1, Number(limit) || 50));
    return readAllTasksSync().sort(sortByUpdatedDesc).slice(0, n);
  } catch (_e) {
    return [];
  }
}

module.exports = {
  DATA_DIR,
  TASK_QUEUE_FILE,
  CORRUPT_QUARANTINE,
  ensureDirAndFiles,
  enqueueTask,
  getPendingTasks,
  getApprovedTasks,
  getTaskById,
  updateTaskStatus,
  markCompleted,
  markFailed,
  getTaskHistory,
  approveTask,
  rejectTask,
  reopenFailedTask,
  readAllTasksSync,
  fingerprintForTask,
  findRecentFingerprintDuplicate,
};
