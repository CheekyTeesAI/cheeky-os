"use strict";

/**
 * PHASE 2 — Extract order hints from inbound text (operator review only).
 */

function detectProductType(text) {
  const lower = String(text || "").toLowerCase();

  if (lower.includes("hoodie")) return "hoodie";
  if (lower.includes("sweatshirt")) return "sweatshirt";
  if (lower.includes("hat") || lower.includes("cap")) return "hat";
  if (lower.includes("polo")) return "polo";
  if (lower.includes("shirt") || lower.includes("tee")) return "t-shirt";

  return null;
}

function detectDecorationMethod(text) {
  const lower = String(text || "").toLowerCase();

  if (lower.includes("embroider")) return "embroidery";
  if (lower.includes("screen print")) return "screen_print";
  if (lower.includes("dtf")) return "dtf";
  if (lower.includes("dtg")) return "dtg";

  return null;
}

function detectDeadline(text) {
  const lower = String(text || "").toLowerCase();

  if (
    lower.includes("rush") ||
    lower.includes("asap") ||
    lower.includes("tomorrow") ||
    lower.includes("next week") ||
    lower.includes("by friday")
  ) {
    return true;
  }

  return false;
}

function extractOrderDetails(message) {
  try {
    const text = `${message.subject || ""} ${message.body || ""}`;
    const qtyMatch = text.match(/\b(\d{1,5})\b/);

    return {
      estimatedQuantity: qtyMatch ? Number(qtyMatch[1]) : null,
      productType: detectProductType(text),
      decorationMethod: detectDecorationMethod(text),
      deadlineMentioned: detectDeadline(text),
      rawText: text,
    };
  } catch (_) {
    return {
      estimatedQuantity: null,
      productType: null,
      decorationMethod: null,
      deadlineMentioned: false,
      rawText: "",
    };
  }
}

module.exports = { extractOrderDetails };
