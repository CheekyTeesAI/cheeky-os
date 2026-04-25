/**
 * Build preview payloads from live job / intake / invoice state.
 */
const { buildTemplate } = require("./communicationTemplateService");
const { buildContextFromPayload, previewCommunication } = require("./communicationOrchestrator");

async function wrapPreview(envelope, built) {
  if (envelope && envelope.error) {
    return { success: false, error: envelope.error };
  }
  return {
    success: true,
    preview: {
      templateKey: envelope.templateKey,
      relatedType: envelope.relatedType,
      relatedId: envelope.relatedId,
      channel: envelope.channel,
      subject: built.subject,
      body: built.body,
      assumptions: built.assumptions || [],
    },
  };
}

async function buildMissingInfoMessage(intakeId) {
  const envelope = await buildContextFromPayload({
    templateKey: "MISSING_INFO",
    relatedType: "INTAKE",
    relatedId: String(intakeId || ""),
    channel: "EMAIL",
  });
  if (envelope && envelope.error) return { success: false, error: envelope.error };
  const built = buildTemplate("MISSING_INFO", "EMAIL", envelope.templateCtx);
  return wrapPreview(envelope, built);
}

async function buildDepositRequiredMessage(jobId) {
  const envelope = await buildContextFromPayload({
    templateKey: "DEPOSIT_REQUIRED",
    relatedType: "JOB",
    relatedId: String(jobId || ""),
    channel: "EMAIL",
  });
  if (envelope && envelope.error) return { success: false, error: envelope.error };
  const built = buildTemplate("DEPOSIT_REQUIRED", "EMAIL", envelope.templateCtx);
  return wrapPreview(envelope, built);
}

async function buildInvoiceReminderMessage(jobOrInvoiceId) {
  const id = String(jobOrInvoiceId || "").trim();
  if (!id) return { success: false, error: "id_required" };
  let relatedType = "JOB";
  let relatedId = id;
  if (id.startsWith("JOB-")) {
    relatedType = "JOB";
    relatedId = id;
  } else if (id.startsWith("inv_") || id.length > 20) {
    relatedType = "INVOICE";
    relatedId = id;
  }
  const envelope = await buildContextFromPayload({
    templateKey: "INVOICE_REMINDER",
    relatedType,
    relatedId,
    channel: "EMAIL",
  });
  if (envelope && envelope.error) return { success: false, error: envelope.error };
  const built = buildTemplate("INVOICE_REMINDER", "EMAIL", envelope.templateCtx);
  return wrapPreview(envelope, built);
}

async function buildReadyForPickupMessage(jobId) {
  const envelope = await buildContextFromPayload({
    templateKey: "READY_FOR_PICKUP",
    relatedType: "JOB",
    relatedId: String(jobId || ""),
    channel: "EMAIL",
  });
  if (envelope && envelope.error) return { success: false, error: envelope.error };
  const built = buildTemplate("READY_FOR_PICKUP", "EMAIL", envelope.templateCtx);
  return wrapPreview(envelope, built);
}

async function buildArtNeededMessage(jobOrIntakeId) {
  const id = String(jobOrIntakeId || "").trim();
  if (!id) return { success: false, error: "id_required" };
  const relatedType = id.startsWith("INT-") ? "INTAKE" : "JOB";
  const envelope = await buildContextFromPayload({
    templateKey: "ART_NEEDED",
    relatedType,
    relatedId: id,
    channel: "EMAIL",
  });
  if (envelope && envelope.error) return { success: false, error: envelope.error };
  const built = buildTemplate("ART_NEEDED", "EMAIL", envelope.templateCtx);
  return wrapPreview(envelope, built);
}

async function buildStatusUpdateMessage(jobId) {
  const envelope = await buildContextFromPayload({
    templateKey: "JOB_STATUS_UPDATE",
    relatedType: "JOB",
    relatedId: String(jobId || ""),
    channel: "EMAIL",
  });
  if (envelope && envelope.error) return { success: false, error: envelope.error };
  const built = buildTemplate("JOB_STATUS_UPDATE", "EMAIL", envelope.templateCtx);
  return wrapPreview(envelope, built);
}

module.exports = {
  buildMissingInfoMessage,
  buildDepositRequiredMessage,
  buildInvoiceReminderMessage,
  buildReadyForPickupMessage,
  buildArtNeededMessage,
  buildStatusUpdateMessage,
  previewCommunication,
};
