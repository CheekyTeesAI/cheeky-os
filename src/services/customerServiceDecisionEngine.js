/**
 * Classify customer-service need from lightweight context.
 */
const { evaluateEscalation } = require("./escalationEngine");

/**
 * @param {object} context — { intake?, job?, textSnippet?, squareMock? }
 */
function classifyServiceNeed(context) {
  const ctx = context && typeof context === "object" ? context : {};
  const text = String(ctx.textSnippet || ctx.summary || "").toLowerCase();
  const reasons = [];

  const esc = evaluateEscalation(
    ctx.serviceDeskItem || {
      summary: ctx.summary || "",
      textSnippet: ctx.textSnippet || "",
      source: ctx.source || "MANUAL",
      relatedId: ctx.relatedId,
      customerId: ctx.customerId,
    }
  );
  if (esc.escalate) {
    return {
      classification: "OWNER_EXCEPTION",
      category: "GENERAL",
      assignedToRole: "OWNER",
      requiresApproval: true,
      autoSafe: false,
      reasons: [...(esc.reasons || []), ...(esc.reason ? [esc.reason] : [])],
    };
  }

  if (/how\s+much|discount|deal|price|quote|negotiate/.test(text)) {
    return {
      classification: "OWNER_APPROVAL_REQUIRED",
      category: "QUOTE",
      assignedToRole: "OWNER",
      requiresApproval: true,
      autoSafe: false,
      reasons: ["pricing_or_negotiation_keywords"],
    };
  }

  if (ctx.job) {
    const j = ctx.job;
    const fs = String(j.foundationStatus || j.teamExecutionPhase || "").toUpperCase();
    const hasArt = j.hasArt === true || (Array.isArray(j.artFiles) && j.artFiles.length > 0);
    if (/status|when|ready|update|where/.test(text) && fs && fs !== "BLOCKED") {
      reasons.push("status_question_with_job_context");
      return {
        classification: "AUTO_STATUS_RESPONSE",
        category: "STATUS",
        assignedToRole: "ADMIN",
        requiresApproval: false,
        autoSafe: true,
        reasons,
      };
    }
    if (/art|proof|vector|file/.test(text) && !hasArt) {
      return {
        classification: "TEAM_ART_QUESTION",
        category: "ART",
        assignedToRole: "DESIGN",
        requiresApproval: false,
        autoSafe: false,
        reasons: ["art_related"],
      };
    }
    if (/print|press|shirt|garment|production/.test(text)) {
      return {
        classification: "TEAM_PRINT_QUESTION",
        category: "GENERAL",
        assignedToRole: "PRINTER",
        requiresApproval: false,
        autoSafe: false,
        reasons: ["production_keywords"],
      };
    }
  }

  if (ctx.intake) {
    const st = String(ctx.intake.status || "").toUpperCase();
    if (st === "NEEDS_INFO" || (Array.isArray(ctx.intake.missingFields) && ctx.intake.missingFields.length)) {
      return {
        classification: "AUTO_MISSING_INFO_REQUEST",
        category: "MISSING_INFO",
        assignedToRole: "ADMIN",
        requiresApproval: false,
        autoSafe: true,
        reasons: ["intake_needs_info"],
      };
    }
  }

  if (/pay|invoice|deposit|square/.test(text)) {
    return {
      classification: "AUTO_PAYMENT_REMINDER",
      category: "PAYMENT",
      assignedToRole: "ADMIN",
      requiresApproval: true,
      autoSafe: false,
      reasons: ["payment_keywords_default_approval"],
    };
  }

  if (/pickup|pick\s+up|ready\s+for/.test(text)) {
    return {
      classification: "OWNER_APPROVAL_REQUIRED",
      category: "PICKUP",
      assignedToRole: "OWNER",
      requiresApproval: true,
      autoSafe: false,
      reasons: ["pickup_message_needs_verification"],
    };
  }

  return {
    classification: "GENERAL_REVIEW",
    category: "GENERAL",
    assignedToRole: "ADMIN",
    requiresApproval: false,
    autoSafe: false,
    reasons: ["no_safe_auto_path"],
  };
}

module.exports = { classifyServiceNeed };
