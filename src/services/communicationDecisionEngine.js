/**
 * Inspect system state and propose outbound communications (recommendations only).
 */
const { getIntakeRecords } = require("./intakeService");
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { getSquareDashboardBundle } = require("./squareSyncEngine");
const { evaluateJobPaymentStatus } = require("./paymentStatusEngine");
const { hasArtFlag } = require("./priorityEngine");
const { findRecentMatchingCommunication } = require("./communicationService");
const { buildDedupeKey, getCooldownForTemplate } = require("./communicationGuardService");
const { resolveJobContact, resolveIntakeContact, emailOk } = require("./communicationContactService");

function makeId(prefix, parts) {
  const crypto = require("crypto");
  const h = crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
  return `${prefix}-${h}`;
}

function recentBlocks(dedupeKey, templateKey) {
  const hours = getCooldownForTemplate(templateKey);
  return !!findRecentMatchingCommunication(dedupeKey, hours);
}

async function buildCommunicationRecommendations() {
  const recommendations = [];
  let squareMock = false;
  let bundle = {};

  try {
    bundle = await getSquareDashboardBundle();
    squareMock = Boolean(bundle.squareStatus && bundle.squareStatus.mock);
  } catch (_e) {
    bundle = {};
  }

  const unpaidList = Array.isArray(bundle.unpaidInvoices) ? bundle.unpaidInvoices : [];
  const invById = new Map(unpaidList.map((x) => [x.squareInvoiceId, x]));

  let jobs = [];
  try {
    jobs = await getOperatingSystemJobs();
  } catch (_e) {
    jobs = [];
  }

  /** Intake — missing info */
  const needsInfo = getIntakeRecords({ status: "NEEDS_INFO", limit: 40 });
  for (const rec of needsInfo) {
    const contact = resolveIntakeContact(rec);
    const channel = emailOk(contact.customerEmail) ? "EMAIL" : "SMS";
    if (!emailOk(contact.customerEmail) && !contact.customerPhone) continue;

    const artLean =
      rec.artDetected ||
      /ART/i.test(String(rec.intent || "")) ||
      (Array.isArray(rec.missingFields) && rec.missingFields.some((x) => /art|file|vector/i.test(String(x))));
    const templateKey = artLean ? "ART_NEEDED" : "MISSING_INFO";
    const type = artLean ? "CUSTOMER_ART_CLARIFY" : "CUSTOMER_MISSING_INFO";
    const dedupeKey = buildDedupeKey({
      relatedType: "INTAKE",
      relatedId: rec.id,
      templateKey,
      channel,
      type,
    });
    if (recentBlocks(dedupeKey, templateKey)) continue;

    recommendations.push({
      recommendationId: makeId("REC", [type, rec.id, channel]),
      type,
      channel,
      relatedType: "INTAKE",
      relatedId: rec.id,
      customerId: contact.customerId,
      templateKey,
      priority: artLean ? "MEDIUM" : "HIGH",
      reason: artLean
        ? "Art-related intake needs clarification or print-ready files."
        : "Intake status NEEDS_INFO — collect missing fields before quoting.",
      dedupeKey,
      customerEmail: contact.customerEmail,
      customerPhone: contact.customerPhone,
      toEmail: contact.customerEmail,
      toPhone: contact.customerPhone,
      labels: squareMock ? ["MOCK_SQUARE_CONTEXT"] : [],
    });
  }

  /** Jobs — payment / art / pickup */
  for (const job of jobs) {
    if (!job || !job.jobId) continue;
    const contact = resolveJobContact(job);
    const row = job.squareInvoiceId ? invById.get(job.squareInvoiceId) : null;
    const squareData = row
      ? { hasSquareLink: true, amountDue: row.amountDue, amountPaid: row.amountPaid }
      : { hasSquareLink: false, amountDue: 0, amountPaid: 0 };
    const ev = evaluateJobPaymentStatus(job, squareData);

    if (ev.paymentState === "BLOCKED_PAYMENT") {
      const channel = emailOk(contact.customerEmail) ? "EMAIL" : "SMS";
      if (!emailOk(contact.customerEmail) && !contact.customerPhone) continue;
      const dedupeKey = buildDedupeKey({
        relatedType: "JOB",
        relatedId: job.jobId,
        templateKey: "DEPOSIT_REQUIRED",
        channel,
        type: "JOB_DEPOSIT",
      });
      if (recentBlocks(dedupeKey, "DEPOSIT_REQUIRED")) continue;
      recommendations.push({
        recommendationId: makeId("REC", ["JOB_DEPOSIT", job.jobId, channel]),
        type: "JOB_DEPOSIT",
        channel,
        relatedType: "JOB",
        relatedId: job.jobId,
        customerId: contact.customerId,
        templateKey: "DEPOSIT_REQUIRED",
        priority: "HIGH",
        reason: "Payment / deposit gate blocking production (per payment rules).",
        dedupeKey,
        customerEmail: contact.customerEmail,
        customerPhone: contact.customerPhone,
        toEmail: contact.customerEmail,
        toPhone: contact.customerPhone,
        labels: squareMock ? ["MOCK_SQUARE_CONTEXT"] : [],
      });
    }

    if (!hasArtFlag(job) && String(job.foundationStatus || "").toUpperCase() !== "COMPLETE") {
      const fos = String(job.foundationStatus || "").toUpperCase();
      if (fos === "BLOCKED" || ev.paymentState === "PAYMENT_OK" || ev.paymentState === "PARTIAL_PAYMENT") {
        const channel = emailOk(contact.customerEmail) ? "EMAIL" : "SMS";
        if (!emailOk(contact.customerEmail) && !contact.customerPhone) continue;
        const dedupeKey = buildDedupeKey({
          relatedType: "JOB",
          relatedId: job.jobId,
          templateKey: "ART_NEEDED",
          channel,
          type: "JOB_ART",
        });
        if (recentBlocks(dedupeKey, "ART_NEEDED")) continue;
        recommendations.push({
          recommendationId: makeId("REC", ["JOB_ART", job.jobId, channel]),
          type: "JOB_ART",
          channel,
          relatedType: "JOB",
          relatedId: job.jobId,
          customerId: contact.customerId,
          templateKey: "ART_NEEDED",
          priority: "MEDIUM",
          reason: "Production blocked — artwork missing or not linked.",
          dedupeKey,
          customerEmail: contact.customerEmail,
          customerPhone: contact.customerPhone,
          toEmail: contact.customerEmail,
          toPhone: contact.customerPhone,
          labels: [],
        });
      }
    }

    if (String(job.foundationStatus || "").toUpperCase() === "COMPLETE") {
      const channel = emailOk(contact.customerEmail) ? "EMAIL" : "SMS";
      if (!emailOk(contact.customerEmail) && !contact.customerPhone) continue;
      const dedupeKey = buildDedupeKey({
        relatedType: "JOB",
        relatedId: job.jobId,
        templateKey: "READY_FOR_PICKUP",
        channel,
        type: "JOB_PICKUP",
      });
      if (recentBlocks(dedupeKey, "READY_FOR_PICKUP")) continue;
      recommendations.push({
        recommendationId: makeId("REC", ["JOB_PICKUP", job.jobId, channel]),
        type: "JOB_PICKUP",
        channel,
        relatedType: "JOB",
        relatedId: job.jobId,
        customerId: contact.customerId,
        templateKey: "READY_FOR_PICKUP",
        priority: "HIGH",
        reason: "Foundation status COMPLETE — customer pickup notification candidate.",
        dedupeKey,
        customerEmail: contact.customerEmail,
        customerPhone: contact.customerPhone,
        toEmail: contact.customerEmail,
        toPhone: contact.customerPhone,
        labels: squareMock ? ["MOCK_SQUARE_CONTEXT"] : [],
      });
    }
  }

  /** Unpaid Square invoices — reminder tied to job when possible */
  const unpaid = (bundle.unpaidInvoices || []).filter((i) => i && !/^PAID$/i.test(String(i.status || "")));
  for (const inv of unpaid.slice(0, 25)) {
    const linked = jobs.find((j) => j && j.squareInvoiceId === inv.squareInvoiceId);
    const contact = linked ? resolveJobContact(linked) : { customerName: "", customerEmail: null, customerPhone: null };
    if (!emailOk(contact.customerEmail) && !contact.customerPhone) continue;
    const relatedId = linked ? linked.jobId : String(inv.squareInvoiceId || inv.id || "INV");
    const relatedType = linked ? "JOB" : "INVOICE";
    const channel = emailOk(contact.customerEmail) ? "EMAIL" : "SMS";
    const dedupeKey = buildDedupeKey({
      relatedType,
      relatedId,
      templateKey: "INVOICE_REMINDER",
      channel,
      type: "INVOICE_REMINDER",
    });
    if (recentBlocks(dedupeKey, "INVOICE_REMINDER")) continue;
    const amountDue = inv.amountDue != null ? Number(inv.amountDue) : null;
    recommendations.push({
      recommendationId: makeId("REC", ["INV", String(inv.squareInvoiceId), channel]),
      type: "INVOICE_REMINDER",
      channel,
      relatedType,
      relatedId,
      customerId: contact.customerId || null,
      templateKey: "INVOICE_REMINDER",
      priority: "MEDIUM",
      reason: "Open unpaid invoice in Square.",
      dedupeKey,
      customerEmail: contact.customerEmail,
      customerPhone: contact.customerPhone,
      toEmail: contact.customerEmail,
      toPhone: contact.customerPhone,
      squareInvoiceId: inv.squareInvoiceId || null,
      amountDue: Number.isFinite(amountDue) ? amountDue : null,
      labels: squareMock ? ["MOCK_SQUARE_INVOICE_AMOUNTS"] : [],
    });
  }

  /** Open estimates — quote ready (only when email is known from linked data) */
  const estimates = (bundle.openEstimates || []).slice(0, 20);
  for (const est of estimates) {
    const estId = String(est.squareInvoiceId || est.id || est.estimateId || "").trim();
    if (!estId) continue;
    const contact = {
      customerEmail: est.customerEmail || null,
      customerPhone: null,
      customerName: est.customerName || "Customer",
    };
    if (!emailOk(contact.customerEmail)) continue;
    const dedupeKey = buildDedupeKey({
      relatedType: "ESTIMATE",
      relatedId: estId,
      templateKey: "QUOTE_READY",
      channel: "EMAIL",
      type: "QUOTE_READY",
    });
    if (recentBlocks(dedupeKey, "QUOTE_READY")) continue;
    recommendations.push({
      recommendationId: makeId("REC", ["EST", estId, "EMAIL"]),
      type: "QUOTE_READY",
      channel: "EMAIL",
      relatedType: "ESTIMATE",
      relatedId: estId,
      customerId: null,
      templateKey: "QUOTE_READY",
      priority: "LOW",
      reason: "Open estimate — quote-ready follow-up.",
      dedupeKey,
      customerEmail: contact.customerEmail,
      toEmail: contact.customerEmail,
      labels: squareMock ? ["MOCK_SQUARE_CONTEXT"] : [],
    });
  }

  /** Ready-for-quote intakes */
  const readyQuote = getIntakeRecords({ status: "READY_FOR_QUOTE", limit: 20 });
  for (const rec of readyQuote) {
    const contact = resolveIntakeContact(rec);
    if (!emailOk(contact.customerEmail) && !contact.customerPhone) continue;
    const channel = emailOk(contact.customerEmail) ? "EMAIL" : "SMS";
    const dedupeKey = buildDedupeKey({
      relatedType: "INTAKE",
      relatedId: rec.id,
      templateKey: "FOLLOWUP_GENERAL",
      channel,
      type: "INTAKE_QUOTE_FOLLOWUP",
    });
    if (recentBlocks(dedupeKey, "FOLLOWUP_GENERAL")) continue;
    recommendations.push({
      recommendationId: makeId("REC", ["READY_Q", rec.id, channel]),
      type: "INTAKE_QUOTE_FOLLOWUP",
      channel,
      relatedType: "INTAKE",
      relatedId: rec.id,
      customerId: contact.customerId,
      templateKey: "FOLLOWUP_GENERAL",
      priority: "LOW",
      reason: "Intake ready for quote — general follow-up.",
      dedupeKey,
      customerEmail: contact.customerEmail,
      customerPhone: contact.customerPhone,
      toEmail: contact.customerEmail,
      toPhone: contact.customerPhone,
      labels: [],
    });
  }

  return { recommendations, meta: { squareMock, recommendationCount: recommendations.length } };
}

module.exports = {
  buildCommunicationRecommendations,
};
