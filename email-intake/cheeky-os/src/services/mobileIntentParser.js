"use strict";

const ID_REGEX = /\b([a-z0-9][a-z0-9-]{2,})\b/i;

function extractOrderId(text) {
  const m = String(text || "").match(/order\s+([a-z0-9][a-z0-9-]{2,})/i);
  if (m && m[1]) return m[1];
  return null;
}

function extractTaskId(text) {
  const m = String(text || "").match(/task\s+([a-z0-9][a-z0-9-]{2,})/i);
  if (m && m[1]) return m[1];
  return null;
}

function extractPriority(text) {
  if (/high/i.test(text)) return "HIGH";
  if (/medium/i.test(text)) return "MEDIUM";
  if (/low/i.test(text)) return "LOW";
  return "MEDIUM";
}

function extractNote(text) {
  const m = String(text || "").match(/to\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();
  return "Mobile operator requested review";
}

function parseMobileIntent(input) {
  const text = String(input || "").trim();
  const lower = text.toLowerCase();
  const extracted = {
    orderId: extractOrderId(text),
    taskId: extractTaskId(text),
    note: extractNote(text),
    priority: extractPriority(text),
  };

  if (!text) {
    return { intent: "unknown", confidence: 0, extracted };
  }

  if (/(system status|status)/i.test(lower)) {
    return { intent: "get_system_status", confidence: 0.95, extracted };
  }
  if (/(operator summary|summary)/i.test(lower)) {
    return { intent: "get_operator_summary", confidence: 0.95, extracted };
  }
  if (/(unpaid deposits|deposits|payment issues)/i.test(lower)) {
    return { intent: "get_unpaid_deposits", confidence: 0.95, extracted };
  }
  if (/(stuck in production|stuck production|stuck jobs)/i.test(lower)) {
    return { intent: "get_stuck_production", confidence: 0.9, extracted };
  }
  if (/(release queue|release)/i.test(lower)) {
    return { intent: "get_release_queue", confidence: 0.9, extracted };
  }
  if (/(vendor drafts|vendor draft list)/i.test(lower)) {
    return { intent: "get_vendor_drafts", confidence: 0.9, extracted };
  }
  if (/(top priorities|what should we do next|what should we do|next best action|top actions)/i.test(lower)) {
    return { intent: "get_top_priorities", confidence: 0.94, extracted };
  }
  if (/(show cash snapshot|cash snapshot|cash position)/i.test(lower)) {
    return { intent: "get_cash_snapshot", confidence: 0.95, extracted };
  }
  if (/(what is our runway|runway|days left)/i.test(lower)) {
    return { intent: "get_runway", confidence: 0.95, extracted };
  }
  if (/(what cash needs attention|cash needs attention|cash priorities|cash pressure)/i.test(lower)) {
    return { intent: "get_cash_attention", confidence: 0.95, extracted };
  }
  if (/(obligations due soon|due soon obligations|upcoming obligations)/i.test(lower)) {
    return { intent: "get_obligations_due_soon", confidence: 0.95, extracted };
  }
  if (
    /(send\s+customer\s+follow|follow-?ups?\s*automatic|auto\w*\s*follow-?up|auto\w*\s*follow|send\s+follow-?ups?|mass\s+follow-?up)/i.test(
      lower
    )
  ) {
    return { intent: "auto_send_customer_followups", confidence: 0.9, extracted };
  }

  if (/create internal task/i.test(lower)) {
    if (!extracted.orderId && !ID_REGEX.test(lower)) {
      return { intent: "create_internal_task", confidence: 0.45, extracted };
    }
    return { intent: "create_internal_task", confidence: 0.88, extracted };
  }
  if (/evaluate release/i.test(lower)) {
    if (!extracted.taskId) {
      return { intent: "evaluate_release", confidence: 0.45, extracted };
    }
    return { intent: "evaluate_release", confidence: 0.9, extracted };
  }
  if (/create vendor draft/i.test(lower)) {
    if (!extracted.taskId) {
      return { intent: "create_vendor_draft", confidence: 0.45, extracted };
    }
    return { intent: "create_vendor_draft", confidence: 0.9, extracted };
  }
  if (/run decision engine/i.test(lower)) {
    return { intent: "run_decision_engine", confidence: 0.95, extracted };
  }

  if (/(send invoice|text customer|send customer message|place vendor order|charge card|mark paid)/i.test(lower)) {
    if (/send invoice/i.test(lower)) return { intent: "send_invoice", confidence: 0.98, extracted };
    if (/text customer|send customer message/i.test(lower)) return { intent: "send_customer_message", confidence: 0.98, extracted };
    if (/place vendor order/i.test(lower)) return { intent: "place_vendor_order", confidence: 0.98, extracted };
    if (/charge card/i.test(lower)) return { intent: "charge_card", confidence: 0.98, extracted };
    if (/mark paid/i.test(lower)) return { intent: "mark_paid_manually", confidence: 0.98, extracted };
  }
  if (/(pay that bill|make payment|charge customer|borrow money|take a loan)/i.test(lower)) {
    if (/(pay that bill|make payment)/i.test(lower)) return { intent: "make_payment", confidence: 0.98, extracted };
    if (/charge customer/i.test(lower)) return { intent: "charge_customer", confidence: 0.98, extracted };
    if (/(borrow money|take a loan)/i.test(lower)) return { intent: "borrow_money", confidence: 0.98, extracted };
  }

  return { intent: "unknown", confidence: 0.2, extracted };
}

module.exports = {
  parseMobileIntent,
};
