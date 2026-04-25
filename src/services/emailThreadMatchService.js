/**
 * Conservative email → entity matching (no fuzzy job guessing).
 */
const { findCustomerMatch } = require("./customerMatchService");
const { getJobs } = require("../data/store");

function extractJobId(text) {
  const m = String(text || "").match(/\b(JOB-[A-Za-z0-9-]+)\b/i);
  return m ? m[1].toUpperCase() : "";
}

function extractIntakeId(text) {
  const m = String(text || "").match(/\b(INT-[A-Za-z0-9-]+)\b/i);
  return m ? m[1].toUpperCase() : "";
}

function isOpenJob(j) {
  const s = String(j && j.status ? j.status : "").toUpperCase();
  return !/^(COMPLETE|CANCELED|CANCELLED|PAID)$/i.test(s);
}

/**
 * @param {object} email normalized
 * @returns {{ matchedType: string, matchedId: string|null, confidence: number, reviewRequired: boolean, reasons: string[] }}
 */
function matchEmailToContext(email) {
  const reasons = [];
  const combined = `${email && email.subject ? email.subject : ""}\n${email && email.bodyText ? email.bodyText : ""}`;
  const fromEmail = String((email && email.fromEmail) || "")
    .trim()
    .toLowerCase();

  const jid = extractJobId(combined);
  if (jid) {
    reasons.push("explicit_job_token");
    return { matchedType: "JOB", matchedId: jid, confidence: 0.98, reviewRequired: false, reasons };
  }

  const iid = extractIntakeId(combined);
  if (iid) {
    reasons.push("explicit_intake_token");
    return { matchedType: "INTAKE", matchedId: iid, confidence: 0.97, reviewRequired: false, reasons };
  }

  const cm = findCustomerMatch({
    name: email && email.fromName,
    email: fromEmail,
    phone: null,
  });
  if (cm.customer && fromEmail) {
    reasons.push(`customer_${cm.matchedBy}`);
    const nm = (s) => String(s || "")
      .trim()
      .toLowerCase();
    const cn = nm(cm.customer.name);
    const jobs = getJobs().filter((j) => j && isOpenJob(j) && nm(j.customer) === cn);
    if (jobs.length === 1) {
      reasons.push("single_open_job_for_customer");
      return {
        matchedType: "JOB",
        matchedId: jobs[0].jobId,
        confidence: Math.min(0.75, cm.confidence || 0.7),
        reviewRequired: true,
        reasons,
      };
    }
    if (jobs.length > 1) {
      reasons.push("multiple_open_jobs");
      return {
        matchedType: "CUSTOMER",
        matchedId: cm.customer.id,
        confidence: cm.confidence || 0.8,
        reviewRequired: true,
        reasons,
      };
    }
    return {
      matchedType: "CUSTOMER",
      matchedId: cm.customer.id,
      confidence: cm.confidence || 0.85,
      reviewRequired: cm.reviewRequired === true,
      reasons,
    };
  }

  return {
    matchedType: "UNKNOWN",
    matchedId: null,
    confidence: 0,
    reviewRequired: true,
    reasons: ["no_match"],
  };
}

module.exports = { matchEmailToContext, extractJobId, extractIntakeId };
