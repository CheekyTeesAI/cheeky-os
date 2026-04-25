/**
 * Single orchestration path for outbound customer communications.
 */
const { buildTemplate } = require("./communicationTemplateService");
const {
  createCommunicationRecord,
  updateCommunicationRecord,
  listCommunications,
} = require("./communicationService");
const {
  buildDedupeKey,
  canSendCommunication,
} = require("./communicationGuardService");
const { sendEmailCommunication } = require("./emailExecutionService");
const { sendSMSCommunication } = require("./smsExecutionService");
const { buildCommunicationRecommendations } = require("./communicationDecisionEngine");
const { resolveJobContact, resolveIntakeContact, emailOk } = require("./communicationContactService");
const { getJobById } = require("../data/store");
const { getIntakeById } = require("./intakeService");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { getSquareDashboardBundle } = require("./squareSyncEngine");
const { requireApproval, getApproval, approveAction } = require("./approvalEngine");

async function commLog(message) {
  try {
    const { logEvent } = require("./foundationEventLog");
    await logEvent(null, "COMMUNICATION", String(message || ""));
  } catch (_e) {
    console.log("[COMMUNICATION]", message);
  }
}

function requiresTemplateApproval(templateKey) {
  const tk = String(templateKey || "").toUpperCase();
  return tk === "INVOICE_REMINDER" || tk === "DEPOSIT_REQUIRED" || tk === "READY_FOR_PICKUP";
}

async function buildContextFromPayload(payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const templateKey = String(p.templateKey || "FOLLOWUP_GENERAL").toUpperCase();
  const relatedType = String(p.relatedType || "GENERAL").toUpperCase();
  const relatedId = String(p.relatedId || "").trim();
  const channel = String(p.channel || "EMAIL").toUpperCase();

  let customerName = "Customer";
  let mockSquare = false;
  let mockJob = false;

  if (relatedType === "INTAKE" && relatedId) {
    const rec = getIntakeById(relatedId);
    if (!rec) return { error: "intake_not_found" };
    const c = resolveIntakeContact(rec);
    customerName = c.customerName || customerName;
    const missingFields = Array.isArray(rec.missingFields) ? rec.missingFields : [];
    return {
      templateKey,
      relatedType,
      relatedId,
      channel,
      contact: c,
      templateCtx: {
        customerName,
        missingFields,
        quoteRef: rec.createdQuoteRef || null,
        mockJob: Boolean(rec.mock),
        mockSquare: false,
      },
    };
  }

  if (relatedType === "JOB" && relatedId) {
    let job = getJobById(relatedId);
    if (!job) {
      const jobs = await getOperatingSystemJobs();
      job = (jobs || []).find((j) => j && j.jobId === relatedId) || null;
    }
    if (!job) return { error: "job_not_found" };
    const c = resolveJobContact(job);
    customerName = c.customerName || customerName;
    mockJob = !job.squareInvoiceId && job.source !== "foundation";

    let amountDue = job.amountDue != null ? Number(job.amountDue) : null;
    try {
      const bundle = await getSquareDashboardBundle();
      mockSquare = Boolean(bundle.squareStatus && bundle.squareStatus.mock);
      const inv = (bundle.unpaidInvoices || []).find((i) => i && i.squareInvoiceId === job.squareInvoiceId);
      if (inv && inv.amountDue != null) amountDue = Number(inv.amountDue);
    } catch (_e) {
      /* ignore */
    }

    const statusLabel = String(job.foundationStatus || job.status || "updated");

    return {
      templateKey,
      relatedType,
      relatedId,
      channel,
      contact: c,
      templateCtx: {
        customerName,
        jobId: job.jobId,
        amountDue: Number.isFinite(amountDue) ? amountDue : null,
        statusLabel,
        quoteRef: job.squareOrderId || null,
        mockJob,
        mockSquare,
      },
    };
  }

  if (relatedType === "INVOICE" && relatedId) {
    try {
      const bundle = await getSquareDashboardBundle();
      mockSquare = Boolean(bundle.squareStatus && bundle.squareStatus.mock);
      const inv = (bundle.unpaidInvoices || []).find(
        (i) => i && (i.squareInvoiceId === relatedId || String(i.squareInvoiceId) === relatedId)
      );
      if (!inv) return { error: "invoice_not_found_in_last_square_fetch" };
      const jobs = await getOperatingSystemJobs();
      const linked = (jobs || []).find((j) => j && j.squareInvoiceId === inv.squareInvoiceId);
      const c = linked ? resolveJobContact(linked) : { customerName: "Customer", customerEmail: null, customerPhone: null };
      return {
        templateKey,
        relatedType,
        relatedId,
        channel,
        contact: c,
        templateCtx: {
          customerName: c.customerName || "Customer",
          amountDue: inv.amountDue != null ? Number(inv.amountDue) : null,
          mockSquare,
        },
      };
    } catch (e) {
      return { error: e && e.message ? e.message : "invoice_resolve_failed" };
    }
  }

  if (relatedType === "ESTIMATE" && relatedId) {
    try {
      const bundle = await getSquareDashboardBundle();
      mockSquare = Boolean(bundle.squareStatus && bundle.squareStatus.mock);
      const est = (bundle.openEstimates || []).find(
        (e) =>
          e &&
          (String(e.squareInvoiceId) === relatedId ||
            String(e.id) === relatedId ||
            String(e.estimateId) === relatedId)
      );
      if (!est) return { error: "estimate_not_found" };
      return {
        templateKey,
        relatedType,
        relatedId,
        channel,
        contact: {
          customerName: est.customerName || "Customer",
          customerEmail: est.customerEmail || null,
          customerPhone: null,
        },
        templateCtx: {
          customerName: est.customerName || "Customer",
          quoteRef: est.id || relatedId,
          mockSquare,
        },
      };
    } catch (e) {
      return { error: e && e.message ? e.message : "estimate_resolve_failed" };
    }
  }

  return { error: "unsupported_related_type" };
}

function envelopeToRecommendation(envelope) {
  if (!envelope || envelope.error) return null;
  const ch = envelope.channel;
  const c = envelope.contact;
  const toEmail = ch === "EMAIL" ? c.customerEmail : null;
  const toPhone = ch === "SMS" ? c.customerPhone : null;
  return {
    templateKey: envelope.templateKey,
    relatedType: envelope.relatedType,
    relatedId: envelope.relatedId,
    channel: ch,
    customerEmail: c.customerEmail,
    customerPhone: c.customerPhone,
    toEmail,
    toPhone,
    dedupeKey: buildDedupeKey({
      relatedType: envelope.relatedType,
      relatedId: envelope.relatedId,
      templateKey: envelope.templateKey,
      channel: ch,
      type: "DIRECT",
    }),
  };
}

async function previewCommunication(payloadOrId) {
  let payload = payloadOrId;
  if (typeof payloadOrId === "string" && payloadOrId.startsWith("REC-")) {
    const { recommendations } = await buildCommunicationRecommendations();
    const hit = (recommendations || []).find((r) => r.recommendationId === payloadOrId);
    if (!hit) return { success: false, error: "recommendation_not_found" };
    payload = {
      templateKey: hit.templateKey,
      relatedType: hit.relatedType,
      relatedId: hit.relatedId,
      channel: hit.channel,
    };
  }

  const envelope = await buildContextFromPayload(payload);
  if (envelope && envelope.error) {
    await commLog(`preview blocked: ${envelope.error}`);
    return { success: false, error: envelope.error };
  }

  const built = buildTemplate(envelope.templateKey, envelope.channel, envelope.templateCtx);
  const recPayload = envelopeToRecommendation(envelope);
  const guard = canSendCommunication(
    {
      ...recPayload,
      toEmail: recPayload.customerEmail,
      toPhone: recPayload.customerPhone,
    },
    { mode: "PREVIEW" }
  );

  const row = createCommunicationRecord({
    channel: envelope.channel,
    direction: "OUTBOUND",
    relatedType: envelope.relatedType,
    relatedId: envelope.relatedId,
    customerId: envelope.contact && envelope.contact.customerId,
    templateKey: envelope.templateKey,
    subject: built.subject,
    body: built.body,
    toAddress: envelope.channel === "EMAIL" ? recPayload.customerEmail : null,
    toPhone: envelope.channel === "SMS" ? recPayload.customerPhone : null,
    status: "PREVIEW",
    dedupeKey: recPayload.dedupeKey,
    metadata: { assumptions: built.assumptions || [], guard },
  });

  await commLog(`preview generated ${row.id} template=${envelope.templateKey}`);

  return {
    success: true,
    communication: row,
    template: built,
    guard,
  };
}

async function sendCommunication(payload, mode, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const m = String(mode || payload.mode || "PREVIEW").toUpperCase();
  const confirmSend = o.confirmSend === true || payload.confirmSend === true;
  const approvalId = o.approvalId || payload.approvalId;

  const envelope = await buildContextFromPayload(payload);
  if (envelope && envelope.error) {
    return { success: false, error: envelope.error };
  }

  const built = buildTemplate(envelope.templateKey, envelope.channel, envelope.templateCtx);
  const recPayload = envelopeToRecommendation(envelope);
  const to =
    envelope.channel === "EMAIL"
      ? recPayload.customerEmail
      : recPayload.customerPhone;

  const guard = canSendCommunication(
    { ...recPayload, toEmail: recPayload.customerEmail, toPhone: recPayload.customerPhone },
    { mode: m === "SEND" ? "SEND" : "PREVIEW" }
  );

  if (m === "SEND" && !guard.allowed && guard.reason === "DUPLICATE_RECENT") {
    await commLog(`duplicate prevented ${recPayload.dedupeKey}`);
    const row = createCommunicationRecord({
      channel: envelope.channel,
      direction: "OUTBOUND",
      relatedType: envelope.relatedType,
      relatedId: envelope.relatedId,
      templateKey: envelope.templateKey,
      subject: built.subject,
      body: built.body,
      toAddress: envelope.channel === "EMAIL" ? to : null,
      toPhone: envelope.channel === "SMS" ? to : null,
      status: "SKIPPED",
      dedupeKey: recPayload.dedupeKey,
      error: "DUPLICATE_RECENT",
      metadata: { guard },
    });
    return { success: false, sent: false, error: "DUPLICATE_RECENT", communication: row, guard };
  }

  if (m === "SEND" && !guard.allowed && guard.reason === "NO_CONTACT") {
    await commLog(`blocked NO_CONTACT ${envelope.templateKey} ${envelope.relatedId}`);
    const row = createCommunicationRecord({
      channel: envelope.channel,
      relatedType: envelope.relatedType,
      relatedId: envelope.relatedId,
      templateKey: envelope.templateKey,
      subject: built.subject,
      body: built.body,
      status: "SKIPPED",
      error: "NO_CONTACT",
      metadata: { guard },
    });
    return { success: false, sent: false, error: "NO_CONTACT", communication: row, guard };
  }

  if (m === "SEND" && !guard.allowed && guard.reason === "PROVIDER_UNAVAILABLE") {
    await commLog(`blocked PROVIDER_UNAVAILABLE ${envelope.channel}`);
    const row = createCommunicationRecord({
      channel: envelope.channel,
      relatedType: envelope.relatedType,
      relatedId: envelope.relatedId,
      templateKey: envelope.templateKey,
      subject: built.subject,
      body: built.body,
      toAddress: envelope.channel === "EMAIL" ? to : null,
      toPhone: envelope.channel === "SMS" ? to : null,
      status: "FAILED",
      error: "PROVIDER_UNAVAILABLE",
      metadata: { guard },
    });
    return { success: false, sent: false, error: "PROVIDER_UNAVAILABLE", communication: row, guard };
  }

  if (m === "SEND" && requiresTemplateApproval(envelope.templateKey)) {
    let approved = confirmSend;
    if (approvalId) {
      const ap = getApproval(approvalId);
      approved =
        ap &&
        ap.status === "APPROVED" &&
        ap.type === "COMM_SEND" &&
        String(ap.payload && ap.payload.dedupeKey) === String(recPayload.dedupeKey);
    }
    if (!approved) {
      const pend = requireApproval("COMM_SEND", {
        templateKey: envelope.templateKey,
        relatedType: envelope.relatedType,
        relatedId: envelope.relatedId,
        channel: envelope.channel,
        dedupeKey: recPayload.dedupeKey,
      });
      await commLog(`approval requested ${pend.id} for ${envelope.templateKey}`);
      const row = createCommunicationRecord({
        channel: envelope.channel,
        relatedType: envelope.relatedType,
        relatedId: envelope.relatedId,
        templateKey: envelope.templateKey,
        subject: built.subject,
        body: built.body,
        toAddress: envelope.channel === "EMAIL" ? to : null,
        toPhone: envelope.channel === "SMS" ? to : null,
        status: "PENDING_APPROVAL",
        dedupeKey: recPayload.dedupeKey,
        metadata: { approvalId: pend.id, guard },
      });
      return {
        success: false,
        sent: false,
        approvalRequired: true,
        approvalId: pend.id,
        reason: "APPROVAL_REQUIRED",
        communication: row,
      };
    }
  }

  const row = createCommunicationRecord({
    channel: envelope.channel,
    direction: "OUTBOUND",
    relatedType: envelope.relatedType,
    relatedId: envelope.relatedId,
    customerId: envelope.contact && envelope.contact.customerId != null ? envelope.contact.customerId : null,
    templateKey: envelope.templateKey,
    subject: built.subject,
    body: built.body,
    toAddress: envelope.channel === "EMAIL" ? to : null,
    toPhone: envelope.channel === "SMS" ? to : null,
    status: m === "SEND" ? "DRAFT" : "PREVIEW",
    dedupeKey: recPayload.dedupeKey,
    metadata: { guard },
  });

  if (m === "PREVIEW") {
    updateCommunicationRecord(row.id, { status: "PREVIEW" });
    await commLog(`preview record ${row.id}`);
    return {
      success: true,
      sent: false,
      mode: "PREVIEW",
      communication: updateCommunicationRecord(row.id, { status: "PREVIEW" }),
      providerResult: null,
    };
  }

  let exec = null;
  if (envelope.channel === "EMAIL") {
    if (!emailOk(to)) {
      updateCommunicationRecord(row.id, { status: "FAILED", error: "NO_CONTACT" });
      return { success: false, sent: false, error: "NO_CONTACT", communication: row };
    }
    exec = await sendEmailCommunication({
      to,
      subject: built.subject || "",
      body: built.body,
      mode: "SEND",
    });
  } else {
    exec = await sendSMSCommunication({ to, body: built.body, mode: "SEND" });
  }

  if (!exec.sent) {
    const failed = updateCommunicationRecord(row.id, {
      status: "FAILED",
      error: exec.error || "send_failed",
      provider: exec.provider,
      metadata: { ...row.metadata, exec },
    });
    await commLog(`send failed ${row.id} ${exec.error}`);
    return {
      success: false,
      sent: false,
      error: exec.error || "send_failed",
      communication: failed,
      providerResult: exec,
    };
  }

  const sentRow = updateCommunicationRecord(row.id, {
    status: "SENT",
    sentAt: new Date().toISOString(),
    provider: exec.provider,
    providerMessageId: exec.providerMessageId || null,
    metadata: { ...row.metadata, exec },
  });
  await commLog(`sent ${row.id} provider=${exec.provider} id=${exec.providerMessageId || ""}`);

  return {
    success: true,
    sent: true,
    mode: "SEND",
    communication: sentRow,
    providerResult: exec,
  };
}

async function previewRecommendedCommunications() {
  const { recommendations } = await buildCommunicationRecommendations();
  const previews = [];
  for (const rec of (recommendations || []).slice(0, 15)) {
    const p = await previewCommunication({
      templateKey: rec.templateKey,
      relatedType: rec.relatedType,
      relatedId: rec.relatedId,
      channel: rec.channel,
    });
    previews.push({ recommendation: rec, result: p });
  }
  return { success: true, count: previews.length, previews };
}

async function sendApprovedCommunication(communicationId) {
  const id = String(communicationId || "").trim();
  const rows = listCommunications({ limit: 200 });
  const row = rows.find((r) => r.id === id);
  if (!row) return { success: false, error: "communication_not_found" };
  if (String(row.status).toUpperCase() !== "PENDING_APPROVAL") {
    return { success: false, error: "not_pending_approval" };
  }
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const aid = meta.approvalId;
  if (!aid) return { success: false, error: "no_approval_link" };

  approveAction(aid);

  return sendCommunication(
    {
      templateKey: row.templateKey,
      relatedType: row.relatedType,
      relatedId: row.relatedId,
      channel: row.channel,
    },
    "SEND",
    { confirmSend: true, approvalId: aid }
  );
}

module.exports = {
  previewCommunication,
  sendCommunication,
  previewRecommendedCommunications,
  sendApprovedCommunication,
  buildContextFromPayload,
  commLog,
};
