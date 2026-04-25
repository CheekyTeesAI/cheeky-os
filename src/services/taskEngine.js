const STANDARD_TASK_TEMPLATES = {
  DTG: ["Pretreat", "Load Garment", "Print", "Cure", "QC"],
  SCREEN: ["Burn Screens", "Setup Press", "Print", "Cure", "QC"],
  DTF: ["Print Transfer", "Press", "Peel", "QC"],
  EMBROIDERY: ["Hoop", "Thread Setup", "Stitch", "Trim", "QC"],
  HEAT_PRESS: ["Cut Vinyl", "Weed", "Press", "QC"],
  UNKNOWN: ["Review Job Details", "Determine Print Method", "QC"],
};

function resolveTemplate(job) {
  const raw = String((job && (job.printMethod || job.productionType)) || "").toUpperCase();
  if (STANDARD_TASK_TEMPLATES[raw]) return { method: raw, template: STANDARD_TASK_TEMPLATES[raw] };
  if (raw === "HEAT PRESS" || raw === "HEAT_PRESS") return { method: "HEAT_PRESS", template: STANDARD_TASK_TEMPLATES.HEAT_PRESS };
  return { method: "UNKNOWN", template: STANDARD_TASK_TEMPLATES.UNKNOWN };
}

function generateTasks(job) {
  try {
    const { method, template } = resolveTemplate(job);
    const tasks = template.map((name, idx) => ({
      order: idx + 1,
      name,
      status: "PENDING",
    }));
    return {
      jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
      customer: job && job.customer ? job.customer : "Unknown Customer",
      printMethod: method,
      tasks,
    };
  } catch (error) {
    console.error("[taskEngine] generateTasks failed:", error && error.message ? error.message : error);
    return {
      jobId: job && job.jobId ? job.jobId : "JOB-UNKNOWN",
      customer: job && job.customer ? job.customer : "Unknown Customer",
      printMethod: "UNKNOWN",
      tasks: [],
      error: error && error.message ? error.message : "task_engine_error",
    };
  }
}

function generateAllTasks(jobs) {
  const list = Array.isArray(jobs) ? jobs : [];
  const all = list.map((j) => generateTasks(j));
  console.log("[taskEngine] TASKS GENERATED:", all.reduce((sum, item) => sum + (Array.isArray(item.tasks) ? item.tasks.length : 0), 0), "tasks across", all.length, "jobs");
  return all;
}

module.exports = {
  generateTasks,
  generateAllTasks,
  STANDARD_TASK_TEMPLATES,
};
