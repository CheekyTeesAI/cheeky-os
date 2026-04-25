/**
 * Convert qualified intake → foundation job (blocks when insufficient).
 */
const { createFoundationJob, registerArtFile } = require("./foundationJobService");
const { promoteAttachmentsToJob } = require("./intakeArtService");
const { logEvent } = require("./foundationEventLog");

function lineItemsFromExtracted(ex) {
  const qty = Math.max(1, Number(ex.quantity) || 1);
  const product = String(ex.garment || "Custom garment").trim();
  const color = (ex.colors && ex.colors[0]) || null;
  const size = (ex.sizes && ex.sizes[0]) || null;
  return [{ product, color, size, quantity: qty }];
}

async function safeLog(msg) {
  try {
    await logEvent(null, "INTAKE", String(msg || ""));
  } catch (_e) {
    console.log("[intakeToJob]", msg);
  }
}

async function convertParsedIntakeToJob(intakeRecord) {
  if (!intakeRecord || !intakeRecord.id) {
    return { success: false, job: null, missingFields: ["intake_record"], intakeStatus: null };
  }
  const ex = intakeRecord.extractedData || {};
  const need = [];
  if (!intakeRecord.customerId) need.push("customer_match");
  if (!ex.quantity || Number(ex.quantity) <= 0) need.push("quantity");
  if (!String(ex.garment || "").trim()) need.push("garment_or_product");
  if (!ex.printLocations || !ex.printLocations.length) need.push("print_locations");
  if (!ex.dueDate || String(ex.dueDate) === "next_friday_relative") need.push("due_date");

  if (need.length) {
    await safeLog(`convert blocked intake=${intakeRecord.id} missing=${need.join(",")}`);
    return {
      success: false,
      job: null,
      missingFields: need,
      intakeStatus: intakeRecord.status,
    };
  }

  let due = ex.dueDate;
  if (due && !/^\d{4}-\d{2}-\d{2}/.test(String(due))) {
    due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  }

  const body = {
    customerName: ex.customerName || "Customer",
    printMethod: ex.printMethod || "SCREEN",
    productionType: ex.printMethod || "SCREEN",
    dueDate: due,
    lineItems: lineItemsFromExtracted(ex),
    hasArt: Boolean(intakeRecord.artDetected),
    artFiles: [],
    depositPaid: false,
  };

  const created = await createFoundationJob(body);
  if (!created.success || !created.job) {
    await safeLog(`foundation job create failed intake=${intakeRecord.id} ${created.reason || ""}`);
    return {
      success: false,
      job: null,
      missingFields: [],
      intakeStatus: intakeRecord.status,
      error: created.reason || "job_create_failed",
    };
  }

  const jobKey = created.job.jobId;
  const linked = Array.isArray(intakeRecord.attachmentsMeta) ? intakeRecord.attachmentsMeta : [];
  const promoted = promoteAttachmentsToJob(intakeRecord.id, jobKey, linked);
  for (const a of promoted) {
    if (a.path) {
      await registerArtFile(jobKey, a.path, "UPLOADED");
    }
  }

  await safeLog(`intake converted to job intake=${intakeRecord.id} job=${jobKey}`);
  return {
    success: true,
    job: created.job,
    missingFields: [],
    intakeStatus: "CONVERTED",
    promotedArt: promoted.length,
  };
}

module.exports = { convertParsedIntakeToJob };
