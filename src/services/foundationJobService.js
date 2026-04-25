const path = require("path");
const { getFoundationPrisma } = require("./foundationPrisma");
const { logEvent } = require("./foundationEventLog");
const { initialStatus, validateTransition, effectiveStatusForRules, OsJobStatus, normalizeStatus } = require("./foundationStateMachine");
const { STANDARD_TASK_TEMPLATES } = require("./taskEngine");

function makeJobKey() {
  return `JOB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function resolveTemplate(pm) {
  const raw = String(pm || "").toUpperCase();
  if (STANDARD_TASK_TEMPLATES[raw]) return STANDARD_TASK_TEMPLATES[raw];
  if (raw === "HEAT PRESS" || raw === "HEAT_PRESS") return STANDARD_TASK_TEMPLATES.HEAT_PRESS;
  return STANDARD_TASK_TEMPLATES.UNKNOWN;
}

async function createTasksForPrintMethod(prisma, jobId, printMethod) {
  const template = resolveTemplate(printMethod);
  const rows = template.map((name, idx) =>
    prisma.foundationTask.create({
      data: { jobId, name, status: "PENDING" },
    }),
  );
  await Promise.all(rows);
}

function mapLineItemsFromBody(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((it) => ({
    product: String((it && (it.product || it.garment)) || "Item"),
    color: it && it.color != null ? String(it.color) : null,
    size: it && it.size != null ? String(it.size) : null,
    quantity: Math.max(0, Math.round(Number((it && it.quantity) || (it && it.qty) || 0))),
  })).filter((r) => r.quantity > 0);
}

function mapToLegacyJob(row) {
  const lineItems = (row.lineItems || []).map((li) => ({
    qty: li.quantity,
    garment: li.product,
    product: li.product,
    color: li.color,
    size: li.size,
  }));
  const artFiles = (row.artFiles || []).map((a) => ({
    path: a.filePath,
    name: path.basename(a.filePath),
    status: a.status,
  }));
  const effective = effectiveStatusForRules({
    status: row.status,
    depositPaid: row.depositPaid,
    artFiles: row.artFiles || [],
  });

  let legacyStatus = "UNPAID";
  const st = normalizeStatus(effective);
  if (st === "COMPLETE") legacyStatus = "PAID";
  else if (st === "BLOCKED") legacyStatus = "OVERDUE";
  else if (st === "PRINTING" || st === "QC") legacyStatus = "READY";

  return {
    jobId: row.jobKey,
    customer: row.customerName,
    customerName: row.customerName,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    printMethod: row.printMethod,
    productionType: row.printMethod,
    lineItems,
    status: legacyStatus,
    depositPaid: row.depositPaid,
    hasArt: artFiles.length > 0,
    artFiles,
    foundationId: row.id,
    foundationStatus: st,
    source: "foundation",
    notes: "",
  };
}

async function listFoundationJobsAsLegacy() {
  const prisma = getFoundationPrisma();
  if (!prisma) return [];
  const rows = await prisma.foundationJob.findMany({
    include: { lineItems: true, artFiles: true, tasks: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapToLegacyJob);
}

async function getFoundationJobByKey(jobKey) {
  const prisma = getFoundationPrisma();
  if (!prisma) return null;
  return prisma.foundationJob.findUnique({
    where: { jobKey: String(jobKey) },
    include: { lineItems: true, artFiles: true, tasks: true },
  });
}

/**
 * Create job in SQLite + tasks + event log. Mirrors legacy shape into JSON store via caller.
 */
async function createFoundationJob(body) {
  const prisma = getFoundationPrisma();
  if (!prisma) return { success: false, reason: "foundation_db_unavailable" };

  const customerName = String(body.customerName || body.customer || "Unknown Customer");
  const printMethod = String(body.printMethod || body.productionType || "UNKNOWN").toUpperCase();
  const dueDate = body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const depositPaid = body.depositPaid === true;
  const lineSpecs = mapLineItemsFromBody(body.items || body.lineItems);
  const hasArtUpload = body.hasArt === true || (Array.isArray(body.artFiles) && body.artFiles.length > 0);

  const jobKey = makeJobKey();
  const status = initialStatus({ depositPaid, hasArt: hasArtUpload });

  const created = await prisma.foundationJob.create({
    data: {
      jobKey,
      customerName,
      status,
      dueDate,
      depositPaid,
      printMethod,
      lineItems: {
        create: lineSpecs.length
          ? lineSpecs
          : [{ product: "Custom", color: null, size: null, quantity: 1 }],
      },
    },
    include: { lineItems: true, artFiles: true },
  });

  await createTasksForPrintMethod(prisma, created.id, printMethod);
  await logEvent(jobKey, "JOB_CREATED", `Job ${jobKey} created for ${customerName} status=${status}`);
  await logEvent(jobKey, "STATUS", `Initial status ${status} (depositPaid=${depositPaid}, hasArt=${hasArtUpload})`);

  const full = await prisma.foundationJob.findUnique({
    where: { id: created.id },
    include: { lineItems: true, artFiles: true, tasks: true },
  });

  return { success: true, job: mapToLegacyJob(full) };
}

async function transitionFoundationJobStatus(jobKey, nextStatus) {
  const prisma = getFoundationPrisma();
  if (!prisma) return { success: false, reason: "foundation_db_unavailable" };

  const row = await prisma.foundationJob.findUnique({
    where: { jobKey: String(jobKey) },
    include: { lineItems: true, artFiles: true, tasks: true },
  });
  if (!row) return { success: false, reason: "not_found" };

  const v = validateTransition(row.status, nextStatus, row);
  if (!v.ok) return { success: false, reason: v.reason || "invalid_transition" };

  const updated = await prisma.foundationJob.update({
    where: { id: row.id },
    data: { status: normalizeStatus(nextStatus) },
    include: { lineItems: true, artFiles: true, tasks: true },
  });

  await logEvent(jobKey, "STATUS_CHANGE", `${row.status} → ${updated.status}`);
  return { success: true, job: mapToLegacyJob(updated) };
}

async function registerArtFile(jobKey, filePath, status) {
  const prisma = getFoundationPrisma();
  if (!prisma) return { success: false, reason: "foundation_db_unavailable" };
  const row = await prisma.foundationJob.findUnique({ where: { jobKey: String(jobKey) } });
  if (!row) return { success: false, reason: "not_found" };

  const st = status || "UPLOADED";
  await prisma.foundationArtFile.create({
    data: {
      jobId: row.id,
      filePath: String(filePath),
      status: st,
    },
  });

  const full = await prisma.foundationJob.findUnique({
    where: { id: row.id },
    include: { lineItems: true, artFiles: true, tasks: true },
  });

  if (
    full.depositPaid
    && (full.artFiles || []).length > 0
    && normalizeStatus(full.status) === OsJobStatus.BLOCKED
  ) {
    await prisma.foundationJob.update({ where: { id: row.id }, data: { status: OsJobStatus.INTAKE } });
  }

  await logEvent(jobKey, "ART_UPLOAD", `Art saved ${filePath}`);
  const after = await prisma.foundationJob.findUnique({
    where: { id: row.id },
    include: { lineItems: true, artFiles: true, tasks: true },
  });
  return { success: true, job: mapToLegacyJob(after) };
}

module.exports = {
  makeJobKey,
  mapToLegacyJob,
  listFoundationJobsAsLegacy,
  getFoundationJobByKey,
  createFoundationJob,
  transitionFoundationJobStatus,
  registerArtFile,
};
