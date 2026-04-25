/**
 * Role-based operator console payload — minimal cards, explicit actions only.
 */
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { buildFullProductionReport } = require("./productionEngine");
const { getAssignments, getCompletedToday } = require("./teamTaskStore");
const { assignTasks } = require("./taskAssignmentEngine");
const { advanceJobs } = require("./productionFlowEngine");
const { getJobs } = require("../data/store");
const { normalizeRole } = require("../config/roles");
const { buildButtonPayload } = require("./uiActionService");
const { listServiceDeskItems } = require("./serviceDeskService");
const { getIntakeRecords } = require("./intakeService");
const { getSquareDashboardBundle } = require("./squareSyncEngine");
const { buildServiceDeskDashboardBundle } = require("./serviceDeskBundle");
const { listCommunications } = require("./communicationService");
const { getOutboundDashboardSlice } = require("./vendorOutboundEngine");

function jobQty(job) {
  const items = Array.isArray(job && job.lineItems) ? job.lineItems : [];
  const n = items.reduce((sum, it) => sum + Number((it && it.qty) || 0), 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function jobNotes(job) {
  const n = job && job.notes != null ? String(job.notes).trim() : "";
  return n ? n.slice(0, 160) : "";
}

function locLine(queueRow, job) {
  const r = queueRow && queueRow.routing;
  if (r && r.location) return String(r.location);
  const v = job && job.vendorLocation;
  if (v) return String(v);
  return "—";
}

function sortAssignments(a, b) {
  return String(a.taskId || "").localeCompare(String(b.taskId || ""));
}

function classifyQc(name) {
  return /qc|quality/i.test(String(name || ""));
}

function mergeJobsMap() {
  const store = getJobs() || [];
  const byId = new Map(store.map((j) => [j.jobId, j]));
  return byId;
}

async function loadProductionContext() {
  await advanceJobs();
  let jobs = [];
  try {
    jobs = await getOperatingSystemJobs();
  } catch (_e) {
    jobs = getJobs();
  }
  const extra = mergeJobsMap();
  for (const j of jobs) {
    if (j && j.jobId && extra.has(j.jobId)) {
      const s = extra.get(j.jobId);
      j.notes = j.notes || s.notes;
      j.lineItems = j.lineItems && j.lineItems.length ? j.lineItems : s.lineItems;
    }
  }
  assignTasks(jobs);
  const production = buildFullProductionReport(jobs);
  return { jobs, production };
}

function tasksForJob(jobId) {
  return getAssignments()
    .filter((a) => a && a.jobId === jobId)
    .sort(sortAssignments);
}

function pickButtonsForJob(jobId, fullJob) {
  const tasks = tasksForJob(jobId);
  const nonQc = tasks.filter((t) => !classifyQc(t.task));
  const qcTs = tasks.filter((t) => classifyQc(t.task));
  const pendingPrint = nonQc.find((t) => String(t.status).toUpperCase() === "PENDING");
  const inProgPrint = nonQc.find((t) => String(t.status).toUpperCase() === "IN_PROGRESS");
  const pendingQc = qcTs.find((t) => String(t.status).toUpperCase() === "PENDING");
  const inProgQc = qcTs.find((t) => String(t.status).toUpperCase() === "IN_PROGRESS");
  const nonQcDone = nonQc.length > 0 && nonQc.every((t) => String(t.status).toUpperCase() === "COMPLETED");
  const active = inProgPrint || inProgQc || pendingPrint || pendingQc || tasks[0];

  const buttons = [];
  const add = (label, actionKey, params) => {
    const p = buildButtonPayload(actionKey, params);
    if (p) buttons.push({ label, ...p });
  };

  if (pendingPrint) add("Start Print", "TASK_START", { taskId: pendingPrint.taskId });
  if (inProgPrint) add("Mark Printed", "TASK_COMPLETE", { taskId: inProgPrint.taskId });
  if (pendingQc && (!pendingPrint && !inProgPrint || nonQcDone)) {
    add("Send to QC", "TASK_START", { taskId: pendingQc.taskId });
  }
  if (inProgQc) add("Mark Complete", "TASK_COMPLETE", { taskId: inProgQc.taskId });
  if (active) add("Flag Issue", "TASK_FLAG", { taskId: active.taskId, reason: "flagged_from_operator" });

  return { buttons, tasks };
}

function toJobCard(queueRow, fullJob, sectionHint) {
  const jobId = queueRow.jobId || fullJob.jobId;
  const title = (fullJob && fullJob.customer) || queueRow.customer || jobId;
  const printType = String(
    (queueRow && queueRow.printMethod) || (fullJob && fullJob.printMethod) || (fullJob && fullJob.productionType) || "—"
  );
  const qty = jobQty(fullJob) || (queueRow && queueRow.routing && queueRow.routing.qty) || "—";
  const loc = locLine(queueRow, fullJob);
  const notes = jobNotes(fullJob);
  const status =
    (fullJob && fullJob.teamExecutionPhase) ||
    String((queueRow && queueRow.status) || (fullJob && fullJob.shopStatus) || "—");
  const priority = Number.isFinite(Number(queueRow && queueRow.priority)) ? Number(queueRow.priority) : 0;
  let nextAction = "Review job";
  if (sectionHint === "PRINT_NEXT") nextAction = "Start or continue print steps";
  if (sectionHint === "BLOCKED") nextAction = "Resolve blocker";
  if (sectionHint === "IN_PRODUCTION") nextAction = "Continue active work";

  const { buttons } = pickButtonsForJob(jobId, fullJob);

  return {
    jobId,
    title,
    status,
    priority,
    nextAction,
    printType,
    quantity: qty,
    locations: loc,
    notes,
    buttons: buttons.filter((b) => b && b.path),
  };
}

async function buildPrinterView(ctx) {
  const { production, jobs } = ctx;
  const jobById = new Map(jobs.map((j) => [j.jobId, j]));
  const ready = (production.ready || []).slice(0, 40);
  const blocked = (production.blocked || []).slice(0, 40);

  const all = getAssignments();
  const inProductionJobIds = new Set(
    all
      .filter((a) => a && String(a.status).toUpperCase() === "IN_PROGRESS")
      .map((a) => a.jobId)
  );

  const printNext = [];
  for (const row of ready) {
    const fj = jobById.get(row.jobId) || { jobId: row.jobId, customer: row.customer };
    if (inProductionJobIds.has(row.jobId)) continue;
    printNext.push(toJobCard(row, fj, "PRINT_NEXT"));
  }

  const inProd = [];
  for (const jid of inProductionJobIds) {
    const row =
      ready.find((r) => r.jobId === jid) ||
      ({ jobId: jid, customer: (jobById.get(jid) || {}).customer, status: "IN_PRODUCTION" });
    const fj = jobById.get(jid) || { jobId: jid };
    inProd.push(toJobCard(row, fj, "IN_PRODUCTION"));
  }

  const blockedCards = [];
  for (const b of blocked) {
    const fj = jobById.get(b.jobId) || { jobId: b.jobId, customer: b.customer };
    const row = {
      jobId: b.jobId,
      customer: b.customer,
      status: b.status,
      printMethod: b.printMethod,
      priority: 0,
      routing: { location: b.reason },
    };
    blockedCards.push({
      ...toJobCard(row, fj, "BLOCKED"),
      nextAction: `Blocked: ${b.reason || "unknown"}`,
    });
  }

  const doneToday = getCompletedToday().slice(0, 30);
  const doneCards = doneToday.map((d) => ({
    jobId: d.jobId,
    title: d.jobId,
    status: "DONE",
    priority: 0,
    nextAction: "Completed today",
    printType: "—",
    quantity: "—",
    locations: "—",
    notes: d.taskId || "",
    buttons: [],
  }));

  return [
    { title: "PRINT NEXT", items: printNext, actions: [] },
    { title: "IN PRODUCTION", items: inProd, actions: [] },
    { title: "BLOCKED", items: blockedCards, actions: [] },
    { title: "DONE TODAY", items: doneCards, actions: [] },
  ];
}

function deskItemCard(row) {
  const id = row.id;
  const buttons = [];
  const b1 = buildButtonPayload("SERVICE_DESK_SEND", { serviceDeskId: id, mode: "PREVIEW" });
  const b2 = buildButtonPayload("SERVICE_DESK_ASSIGN", { serviceDeskId: id, assignedToRole: "ADMIN" });
  const b3 = buildButtonPayload("SERVICE_DESK_CLOSE", { serviceDeskId: id });
  if (b1) buttons.push({ label: "Send Message (preview)", ...b1 });
  if (b2) buttons.push({ label: "Assign to admin", ...b2 });
  if (b3) buttons.push({ label: "Close item", ...b3 });
  return {
    jobId: id,
    title: String(row.summary || id).slice(0, 120),
    status: String(row.state || ""),
    priority: row.priority === "HIGH" || row.priority === "URGENT" ? 2 : 1,
    nextAction: "Respond or route",
    printType: "—",
    quantity: "—",
    locations: String(row.relatedType || ""),
    notes: String(row.category || ""),
    buttons,
  };
}

async function buildAdminView() {
  const cs = listServiceDeskItems({ limit: 25 }).filter((r) => !/CLOSED/i.test(String(r.state || "")));
  const intakes = (getIntakeRecords({ limit: 80 }) || []).filter((r) =>
    /NEEDS_INFO|REVIEW_REQUIRED/i.test(String(r.status || ""))
  );

  let unpaid = [];
  let estimates = [];
  try {
    const sq = await getSquareDashboardBundle();
    unpaid = (sq.unpaidInvoices || []).slice(0, 15);
    estimates = (sq.openEstimates || []).slice(0, 10);
  } catch (_e) {
    unpaid = [];
    estimates = [];
  }

  let jobs = [];
  try {
    jobs = await getOperatingSystemJobs();
  } catch (_e) {
    jobs = getJobs() || [];
  }
  const pickupReady = jobs
    .filter((j) => j && (j.teamPickupReady === true || String(j.teamExecutionPhase).toUpperCase() === "COMPLETE"))
    .slice(0, 20)
    .map((j) => ({
      jobId: j.jobId,
      title: j.customer || j.jobId,
      status: String(j.teamExecutionPhase || j.status || ""),
      priority: 1,
      nextAction: "Notify customer / mark picked up",
      printType: j.printMethod || "—",
      quantity: jobQty(j) || "—",
      locations: "—",
      notes: jobNotes(j),
      buttons: [
        ...(buildButtonPayload("COMM_PREVIEW", {
          templateKey: "READY_FOR_PICKUP",
          relatedType: "JOB",
          relatedId: j.jobId,
          channel: "EMAIL",
        })
          ? [
              {
                label: "Preview pickup message",
                ...buildButtonPayload("COMM_PREVIEW", {
                  templateKey: "READY_FOR_PICKUP",
                  relatedType: "JOB",
                  relatedId: j.jobId,
                  channel: "EMAIL",
                }),
              },
            ]
          : []),
      ].filter((x) => x.path),
    }));

  const payCards = unpaid.map((inv) => ({
    jobId: inv.squareInvoiceId || inv.id || "INV",
    title: inv.customerName || "Invoice",
    status: "UNPAID",
    priority: 2,
    nextAction: "Collect payment",
    printType: "—",
    quantity: "—",
    locations: "—",
    notes: `Due: ${inv.amountDue != null ? inv.amountDue : "?"}`,
    buttons: [],
  }));

  return [
    { title: "CUSTOMER SERVICE", items: cs.map(deskItemCard), actions: [] },
    {
      title: "MISSING INFO",
      items: intakes.map((r) => ({
        jobId: r.id,
        title: (r.extractedData && r.extractedData.customerName) || r.id,
        status: String(r.status || ""),
        priority: 1,
        nextAction: "Request missing fields",
        printType: "—",
        quantity: "—",
        locations: "INTAKE",
        notes: (Array.isArray(r.missingFields) ? r.missingFields.join(", ") : "").slice(0, 120),
        buttons: [
          ...(buildButtonPayload("COMM_PREVIEW", {
            templateKey: "MISSING_INFO",
            relatedType: "INTAKE",
            relatedId: r.id,
            channel: "EMAIL",
          })
            ? [
                {
                  label: "Preview request",
                  ...buildButtonPayload("COMM_PREVIEW", {
                    templateKey: "MISSING_INFO",
                    relatedType: "INTAKE",
                    relatedId: r.id,
                    channel: "EMAIL",
                  }),
                },
              ]
            : []),
        ],
      })),
      actions: [],
    },
    { title: "PAYMENTS", items: payCards, actions: [] },
    { title: "PICKUP READY", items: pickupReady, actions: [] },
  ];
}

async function buildOwnerView() {
  const bundle = buildServiceDeskDashboardBundle();
  const esc = (bundle.ownerExceptions || []).map((row) => ({
    ...deskItemCard(row),
    nextAction: "Review escalation",
  }));

  const pendingComms = listCommunications({ status: "PENDING_APPROVAL", limit: 20 });
  const approvals = pendingComms.map((c) => ({
    jobId: c.id,
    title: `${c.templateKey || "Comm"} · ${c.relatedType} ${c.relatedId}`,
    status: c.status,
    priority: 2,
    nextAction: "Approve or reject send",
    printType: "—",
    quantity: "—",
    locations: "—",
    notes: (c.subject || "").slice(0, 80),
    buttons: [
      ...(buildButtonPayload("APPROVE_SEND", { communicationId: c.id })
        ? [{ label: "Approve send", ...buildButtonPayload("APPROVE_SEND", { communicationId: c.id }) }]
        : []),
    ],
  }));

  let vendorApprovals = [];
  try {
    const dash = getOutboundDashboardSlice();
    vendorApprovals = (dash.pendingApprovals || []).slice(0, 15).map((p) => {
      const aid = p.id || p.approvalId;
      const poNum = p.payload && p.payload.poNumber;
      return {
        jobId: aid || poNum || "PO",
        title: String(poNum || "Vendor PO approval"),
        status: "PENDING",
        priority: 2,
        nextAction: "Approve PO send",
        printType: "—",
        quantity: "—",
        locations: "—",
        notes: "",
        buttons: [
          ...(buildButtonPayload("VENDOR_APPROVE", { approvalId: aid })
            ? [{ label: "Approve vendor", ...buildButtonPayload("VENDOR_APPROVE", { approvalId: aid }) }]
            : []),
        ],
      };
    });
  } catch (_e) {
    vendorApprovals = [];
  }

  const mergedApprovals = [...approvals, ...vendorApprovals];

  const overrides = [
    {
      jobId: "override",
      title: "Routing & assignments",
      status: "INFO",
      priority: 0,
      nextAction: "Use /command or PATCH /jobs/:id",
      printType: "—",
      quantity: "—",
      locations: "—",
      notes: "Force route / reassign via existing job + service desk commands",
      buttons: [],
    },
  ];

  return [
    { title: "EXCEPTIONS", items: esc, actions: [] },
    { title: "APPROVALS", items: mergedApprovals, actions: [] },
    { title: "OVERRIDES", items: overrides, actions: [] },
  ];
}

async function buildDesignView(ctx) {
  const { jobs } = ctx;
  const artNeeded = [];
  const artReview = [];
  for (const j of jobs || []) {
    if (!j || !j.jobId) continue;
    const hasArt = j.hasArt === true || j.artReady === true;
    const card = toJobCard(
      {
        jobId: j.jobId,
        customer: j.customer,
        status: j.status,
        printMethod: j.printMethod,
        priority: Number(j.priorityScore) || 0,
        routing: null,
      },
      j,
      "PRINT_NEXT"
    );
    if (!hasArt) artNeeded.push({ ...card, nextAction: "Obtain / upload art" });
    else artReview.push({ ...card, nextAction: "Confirm art for production" });
  }
  return [
    { title: "ART NEEDED", items: artNeeded.slice(0, 30), actions: [] },
    { title: "ART REVIEW", items: artReview.slice(0, 30), actions: [] },
  ];
}

async function getOperatorView(role) {
  const r = normalizeRole(role);
  const ctx = await loadProductionContext();

  let sections = [];
  if (r === "PRINTER") sections = await buildPrinterView(ctx);
  else if (r === "ADMIN") sections = await buildAdminView();
  else if (r === "OWNER") sections = await buildOwnerView();
  else if (r === "DESIGN") sections = await buildDesignView(ctx);
  else sections = await buildAdminView();

  const pruned = sections.map((sec) => ({
    ...sec,
    items: (sec.items || []).map((item) => ({
      ...item,
      buttons: (item.buttons || []).filter((b) => b && b.path),
    })),
  }));

  return {
    role: r,
    sections: pruned,
    meta: { generatedAt: new Date().toISOString() },
  };
}

module.exports = {
  getOperatorView,
};
