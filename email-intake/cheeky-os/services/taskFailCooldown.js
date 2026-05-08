"use strict";

/**

 * Cooldown after failures before another manual/processor execution (additive safety).

 */

const fs = require("fs");

const path = require("path");

const taskQueue = require("../agent/taskQueue");

const COOLDOWN_FILE = path.join(taskQueue.DATA_DIR, "task-fail-cooldown.json");

function defaultMs() {


  try {


    const n = Number(process.env.CHEEKY_TASK_FAIL_COOLDOWN_MS || 120000);


    return Number.isFinite(n) && n >= 5000 ? Math.min(n, 3600000) : 120000;


  } catch (_e) {




    return 120000;


  }


}




function load() {


  try {






      taskQueue.ensureDirAndFiles();





      if (!fs.existsSync(COOLDOWN_FILE)) return {};


      const j = JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf8"));


      return j && typeof j.lastFailAtMsByTask === "object" ? j.lastFailAtMsByTask : {};


    } catch (_e) {




      return {};


    }


}





function save(map) {


  try {





    taskQueue.ensureDirAndFiles();


    fs.writeFileSync(


      COOLDOWN_FILE,


      JSON.stringify({ lastFailAtMsByTask: map, updatedAt: new Date().toISOString() }, null, 2),


      "utf8"


    );


  } catch (_e) {}



}





function recordFailure(taskId) {


  try {





    const id = String(taskId || "").trim();


    if (!id) return;


    const m = load();


    m[id] = Date.now();


    save(m);


  } catch (_e) {}



}





function isCoolingDown(taskId) {


  try {





    const id = String(taskId || "").trim();


    if (!id) return { cooling: false, retryAfterMs: 0 };


    const m = load();


    const last = Number(m[id] || 0);


    if (!Number.isFinite(last) || !last) return { cooling: false, retryAfterMs: 0 };


    const elapsed = Date.now() - last;


    const need = defaultMs();


    if (elapsed >= need) return { cooling: false, retryAfterMs: 0 };


    return { cooling: true, retryAfterMs: Math.max(0, need - elapsed) };


  } catch (_e) {




    return { cooling: false, retryAfterMs: 0 };


  }


}





module.exports = {


  recordFailure,


  isCoolingDown,


  COOLDOWN_FILE,


};

