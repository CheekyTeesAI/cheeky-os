/**
 * Next-step status from structured intake (no fabrication).
 */

const STATUSES = {
  NEW: "NEW",
  PARSED: "PARSED",
  NEEDS_INFO: "NEEDS_INFO",
  READY_FOR_QUOTE: "READY_FOR_QUOTE",
  READY_FOR_JOB: "READY_FOR_JOB",
  CONVERTED: "CONVERTED",
  ARCHIVED: "ARCHIVED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
};

function hasCustomer(rec) {
  return Boolean(rec && rec.customerId);
}

function coreFieldsPresent(ex) {
  const q = ex && ex.quantity != null && Number(ex.quantity) > 0;
  const g = ex && String(ex.garment || "").trim().length > 0;
  return Boolean(q && g);
}

function dueOk(ex) {
  const d = ex && ex.dueDate;
  if (!d) return false;
  if (String(d) === "next_friday_relative") return false;
  return String(d).length > 3;
}

/**
 * @param {object} intakeRecord - persisted shape with intent, extractedData, artDetected, ...
 */
function decideNextStep(intakeRecord) {
  const reasons = [];
  const intent = String((intakeRecord && intakeRecord.intent) || "UNKNOWN");
  const ex = (intakeRecord && intakeRecord.extractedData) || {};
  const missing = Array.isArray(intakeRecord.missingFields) ? intakeRecord.missingFields : [];

  if (intakeRecord.reviewRequired || intent === "UNKNOWN") {
    reasons.push("ambiguous_or_unknown_intent");
    return {
      status: STATUSES.REVIEW_REQUIRED,
      nextAction: "staff_review",
      reasons,
    };
  }

  if (intent === "STATUS_REQUEST") {
    reasons.push("status_lookup_no_new_job");
    return {
      status: STATUSES.PARSED,
      nextAction: "customer_service_status_lookup",
      reasons,
    };
  }

  if (intent === "REORDER") {
    reasons.push("reorder_link_prior_job");
    return {
      status: STATUSES.NEEDS_INFO,
      nextAction: "match_prior_order",
      reasons,
    };
  }

  if (intent === "QUOTE_REQUEST") {
    const ok = coreFieldsPresent(ex) && hasCustomer(intakeRecord);
    if (ok) {
      reasons.push("quote_fields_mostly_present");
      return {
        status: STATUSES.READY_FOR_QUOTE,
        nextAction: "build_estimate",
        reasons,
      };
    }
    reasons.push("missing_fields_for_quote");
    return {
      status: STATUSES.NEEDS_INFO,
      nextAction: "request_missing_quote_fields",
      reasons,
    };
  }

  if (intent === "NEW_ORDER" || intent === "ART_SUBMISSION") {
    const cust = hasCustomer(intakeRecord);
    const detail = coreFieldsPresent(ex) && (ex.printLocations || []).length > 0;
    const dateOk = dueOk(ex);
    if (cust && detail && dateOk) {
      reasons.push("ready_for_job_pipeline");
      return {
        status: STATUSES.READY_FOR_JOB,
        nextAction: "convert_to_job_when_approved",
        reasons,
      };
    }
    reasons.push("insufficient_detail_for_job");
    return {
      status: STATUSES.NEEDS_INFO,
      nextAction: "collect_production_details",
      reasons,
    };
  }

  if (intent === "GENERAL_QUESTION") {
    return {
      status: STATUSES.PARSED,
      nextAction: "respond_or_clarify",
      reasons: ["general_inquiry"],
    };
  }

  return {
    status: STATUSES.REVIEW_REQUIRED,
    nextAction: "staff_review",
    reasons: ["fallback_review"],
  };
}

module.exports = { decideNextStep, STATUSES };
