/**
 * Build routine response text from service desk item + system truth.
 */
const { buildTemplate } = require("./communicationTemplateService");
const { buildCustomerStatusAnswer, resolveJob } = require("./statusAnswerService");
const { getIntakeById } = require("./intakeService");

async function buildAutoSafeResponse(serviceDeskItem) {
  const item = serviceDeskItem && typeof serviceDeskItem === "object" ? serviceDeskItem : {};
  const cat = String(item.category || "GENERAL").toUpperCase();
  const assumptions = ["Built from current intake/job state when available — verify before send."];

  if (cat === "STATUS" && item.relatedType === "JOB" && item.relatedId) {
    const ans = await buildCustomerStatusAnswer(item.relatedId);
    if (!ans.canAnswer) {
      return {
        templateKey: "JOB_STATUS_UPDATE",
        channel: "EMAIL",
        subject: null,
        body: null,
        autoSafe: false,
        assumptions: [...assumptions, ans.reason || "cannot_auto_answer"],
      };
    }
    return {
      templateKey: "JOB_STATUS_UPDATE",
      channel: "EMAIL",
      subject: ans.subject,
      body: ans.body,
      autoSafe: true,
      assumptions,
    };
  }

  if (cat === "MISSING_INFO" && item.relatedType === "INTAKE" && item.relatedId) {
    const rec = getIntakeById(item.relatedId);
    if (!rec) {
      return {
        templateKey: "MISSING_INFO",
        channel: "EMAIL",
        subject: null,
        body: null,
        autoSafe: false,
        assumptions: [...assumptions, "intake_not_found"],
      };
    }
    const ctx = {
      customerName: (rec.extractedData && rec.extractedData.customerName) || "there",
      missingFields: Array.isArray(rec.missingFields) ? rec.missingFields : ["details"],
      mockJob: Boolean(rec.mock),
    };
    const t = buildTemplate("MISSING_INFO", "EMAIL", ctx);
    return {
      templateKey: "MISSING_INFO",
      channel: "EMAIL",
      subject: t.subject,
      body: t.body,
      autoSafe: true,
      assumptions: t.assumptions || assumptions,
    };
  }

  if (cat === "ART" && item.relatedType === "JOB" && item.relatedId) {
    const job = await resolveJob(item.relatedId);
    if (!job) {
      return {
        templateKey: "ART_NEEDED",
        channel: "EMAIL",
        subject: null,
        body: null,
        autoSafe: false,
        assumptions: [...assumptions, "job_not_found"],
      };
    }
    const ctx = {
      customerName: job.customer || job.customerName || "there",
      jobId: job.jobId,
    };
    const t = buildTemplate("ART_NEEDED", "EMAIL", ctx);
    return {
      templateKey: "ART_NEEDED",
      channel: "EMAIL",
      subject: t.subject,
      body: t.body,
      autoSafe: true,
      assumptions: t.assumptions || assumptions,
    };
  }

  const ack =
    "Thanks for your message — we received it and our team will follow up shortly with next steps.";
  return {
    templateKey: "FOLLOWUP_GENERAL",
    channel: "EMAIL",
    subject: "We received your message",
    body: ack,
    autoSafe: true,
    assumptions: [...assumptions, "generic_acknowledgment"],
  };
}

module.exports = { buildAutoSafeResponse };
