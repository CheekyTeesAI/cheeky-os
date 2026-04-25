/**
 * Demo / training records — all marked isDemo; clear only removes demo-flagged rows.
 */
const fs = require("fs");
const path = require("path");
const { saveJob, deleteJobIfDemo, getJobs } = require("../data/store");
const { createIntakeRecord, removeIntakeRecordsWhere } = require("./intakeService");
const {
  createServiceDeskItem,
  removeServiceDeskItemsWhere,
  getServiceDeskItem,
} = require("./serviceDeskService");
const {
  createCommunicationRecord,
  removeCommunicationsWhere,
  listCommunications,
} = require("./communicationService");
const { createPost, deletePostByIdIfDemo } = require("./contentStore");
const { syncPurchaseOrdersFromPlan, removePurchaseOrdersIf } = require("./poRegistryService");
const { upsertAssignments, removeAssignmentsWhere } = require("./teamTaskStore");
const adoptionStateStore = require("./adoptionStateStore");
const { logAdoptionEvent } = require("./adoptionEventLog");

const DATA_DIR = path.join(process.cwd(), "data");
const REGISTRY = path.join(DATA_DIR, "demo-registry.json");

const IDS = {
  job: "DEMO-JOB-TRAIN-001",
  intake: "INT-DEMO-CHEEKY-001",
  serviceDesk: "DEMO-SD-001",
  communication: "COM-DEMO-001",
  contentPost: "demo-post-chew-001",
  task: "DEMO-TT-001",
  po: "DEMO-PO-001",
};

function loadRegistry() {
  try {
    if (!fs.existsSync(REGISTRY)) return { version: 1, ids: {} };
    const j = JSON.parse(fs.readFileSync(REGISTRY, "utf8") || "{}");
    return { version: 1, ids: j.ids && typeof j.ids === "object" ? j.ids : {} };
  } catch (_e) {
    return { version: 1, ids: {} };
  }
}

function saveRegistry(ids) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(REGISTRY, JSON.stringify({ version: 1, ids }, null, 2), "utf8");
  } catch (e) {
    console.warn("[demoDataService] registry save:", e && e.message ? e.message : e);
  }
}

function countDemoLike() {
  let n = 0;
  try {
    n += getJobs().filter((j) => j && (j.isDemo === true || /^DEMO-/i.test(j.jobId || ""))).length;
  } catch (_e) {
    /* ignore */
  }
  return n;
}

function getDemoDataStatus() {
  const reg = loadRegistry();
  const st = adoptionStateStore.load();
  return {
    seeded: Number(st.demoSeedVersion || 0) > 0,
    demoSeedVersion: st.demoSeedVersion || 0,
    registry: reg.ids,
    demoJobCount: countDemoLike(),
  };
}

/**
 * @param {{ confirm?: boolean }} opts
 */
async function seedDemoData(opts) {
  if (!opts || opts.confirm !== true) {
    return { ok: false, error: "confirm_required", message: 'Pass { "confirm": true } to seed demo data.' };
  }

  const regExisting = loadRegistry();
  if (regExisting.ids && regExisting.ids.job) {
    return {
      ok: true,
      idempotent: true,
      message: "Demo data already seeded. POST /setup/demo/clear with confirm:true first to re-seed.",
      registry: regExisting.ids,
    };
  }

  const created = [];
  const reg = loadRegistry().ids;

  const job = saveJob({
    jobId: IDS.job,
    customer: "Demo Customer (Training)",
    status: "READY",
    productionType: "SCREEN",
    lineItems: [{ qty: 12, garment: "SHIRT", color: "BLACK" }],
    notes: "Demo job — safe to delete via POST /setup/demo/clear",
    isDemo: true,
    shopStatus: "READY",
    hasArt: true,
  });
  created.push({ type: "job", id: job.jobId });
  reg.job = job.jobId;

  const intake = createIntakeRecord({
    id: IDS.intake,
    source: "DEMO",
    rawSubject: "Demo inquiry — team training",
    rawBody: "We need 24 tees with a one-color front print. This is demo data.",
    normalizedText: "demo training intake",
    intent: "QUOTE",
    status: "NEW",
    isDemo: true,
    extractedData: { quantity: 24, garment: "tee" },
  });
  created.push({ type: "intake", id: intake.id });
  reg.intake = intake.id;

  let sd = getServiceDeskItem(IDS.serviceDesk);
  if (!sd) {
    sd = createServiceDeskItem({
      id: IDS.serviceDesk,
      relatedType: "JOB",
      relatedId: IDS.job,
      category: "GENERAL",
      state: "WAITING_TEAM",
      summary: "Demo: customer asked about rush turnaround (training)",
      assignedToRole: "ADMIN",
      metadata: { isDemo: true },
    });
  }
  created.push({ type: "serviceDesk", id: sd.id });
  reg.serviceDesk = sd.id;

  let com = listCommunications({ limit: 500 }).find((c) => c && c.id === IDS.communication);
  if (!com) {
    com = createCommunicationRecord({
    id: IDS.communication,
    channel: "EMAIL",
    direction: "OUTBOUND",
    relatedType: "JOB",
    relatedId: IDS.job,
    templateKey: "FOLLOWUP_GENERAL",
    subject: "[DEMO] Follow-up — training",
    body: "This is a demo draft communication. It is not sent automatically.",
    status: "DRAFT",
    metadata: { isDemo: true },
  });
  }
  created.push({ type: "communication", id: com.id });
  reg.communication = com.id;

  const demoDate = "2099-12-31";
  const post = createPost({
    id: IDS.contentPost,
    date: demoDate,
    status: "DRAFT",
    isDemo: true,
    payload: {
      id: IDS.contentPost,
      date: demoDate,
      isDemo: true,
      idea: "Behind-the-scenes reel: ink mixing",
      hook: "Ever wonder how we match Pantone?",
      postType: "REEL",
      status: "DRAFT",
    },
  });
  created.push({ type: "content", id: post && post.id });
  reg.contentPost = post && post.id;

  syncPurchaseOrdersFromPlan([
    {
      poNumber: IDS.po,
      supplier: "Carolina Made",
      items: [{ sku: "DEMO-BLANK", qty: 24, description: "Training line" }],
      totalUnits: 24,
      linkedJobs: [IDS.job],
      notes: "Demo PO — not sent",
      isDemo: true,
    },
  ]);
  created.push({ type: "purchaseOrder", id: IDS.po });
  reg.po = IDS.po;

  upsertAssignments([
    {
      taskId: IDS.task,
      jobId: IDS.job,
      title: "Print front — demo task",
      status: "PENDING",
      assignedTo: "jeremy",
      isDemo: true,
    },
  ]);
  created.push({ type: "task", id: IDS.task });
  reg.task = IDS.task;

  const ver = Number(adoptionStateStore.load().demoSeedVersion || 0) + 1;
  adoptionStateStore.save({ demoSeedVersion: ver });
  saveRegistry(reg);

  logAdoptionEvent("demo_seed", { created: created.map((c) => c.type), version: ver });

  return {
    ok: true,
    demoSeedVersion: ver,
    created,
    counts: {
      entities: created.length,
    },
  };
}

/**
 * @param {{ confirm?: boolean }} opts
 */
async function clearDemoData(opts) {
  if (!opts || opts.confirm !== true) {
    return { ok: false, error: "confirm_required", message: 'Pass { "confirm": true } to clear demo data.' };
  }

  const removed = { jobs: 0, intake: 0, serviceDesk: 0, communications: 0, content: 0, purchaseOrders: 0, tasks: 0 };

  removed.jobs += deleteJobIfDemo(IDS.job) ? 1 : 0;

  removed.intake += removeIntakeRecordsWhere((r) => r && r.isDemo === true);

  removed.serviceDesk += removeServiceDeskItemsWhere((r) => r && r.metadata && r.metadata.isDemo === true);

  removed.communications += removeCommunicationsWhere((r) => r && r.metadata && r.metadata.isDemo === true);

  if (deletePostByIdIfDemo(IDS.contentPost)) removed.content += 1;

  removed.purchaseOrders += removePurchaseOrdersIf(
    (o) => o && (o.isDemo === true || String(o.poNumber || "").startsWith("DEMO-PO")),
  );

  removed.tasks += removeAssignmentsWhere((a) => a && (a.isDemo === true || /^DEMO-TT/i.test(String(a.taskId || ""))));

  adoptionStateStore.save({ demoSeedVersion: 0 });
  try {
    if (fs.existsSync(REGISTRY)) fs.unlinkSync(REGISTRY);
  } catch (_e) {
    /* ignore */
  }

  logAdoptionEvent("demo_clear", removed);

  return { ok: true, removed };
}

module.exports = {
  seedDemoData,
  clearDemoData,
  getDemoDataStatus,
  IDS,
};
