/**
 * Bundle 50 — map lead + quote → capture-oriented fields (no DB).
 */

const { computeQuickQuote } = require("./quickQuoteService");

/**
 * @param {unknown} v
 * @returns {string}
 */
function trim(v) {
  return String(v == null ? "" : v).trim();
}

/**
 * @param {string} message
 * @returns {string}
 */
function inferProduct(message) {
  const m = String(message || "").toLowerCase();
  if (/\bhoodie?s?\b/.test(m)) return "hoodie";
  if (/\b(tote|canvas\s+bags?|bags?)\b/.test(m)) return "tote";
  if (/\b(shirts?|tees?)\b/.test(m)) return "shirt";
  return "shirt";
}

/**
 * @param {string} message
 * @returns {string}
 */
function inferPrintType(message) {
  const m = String(message || "").toLowerCase();
  if (
    /front\s+and\s+back/.test(m) ||
    /front\s*\/\s*back/.test(m) ||
    /front\s*&\s*back/.test(m)
  ) {
    return "front/back";
  }
  if (/front\s+left\s+chest/.test(m) || /\bflc\b/.test(m)) return "flc";
  if (/\bfront\b/.test(m) && /\bback\b/.test(m) && !/front\s+and\s+back/.test(m)) {
    return "front/back";
  }
  if (/\bfront\b/.test(m)) return "front";
  if (/\bback\b/.test(m)) return "back";
  return "unknown";
}

/**
 * @param {string} message
 * @returns {string}
 */
function extractDueHints(message) {
  const m = String(message || "").toLowerCase();
  /** @type {string[]} */
  const found = [];
  const pairs = [
    [/\btoday\b/, "today"],
    [/\btomorrow\b/, "tomorrow"],
    [/\bnext\s+week\b/, "next week"],
    [/\burgent\b/, "urgent"],
    [/\bfriday\b/, "friday"],
  ];
  for (const [re, lab] of pairs) {
    if (re.test(m)) found.push(lab);
  }
  return found.join(", ");
}

/**
 * @param {{
 *   name?: string,
 *   email?: string,
 *   phone?: string,
 *   company?: string,
 *   message?: string,
 *   source?: string,
 *   quote?: {
 *     estimatedQuantity?: unknown,
 *     estimatedPricePerShirt?: unknown,
 *     estimatedTotal?: unknown,
 *     confidence?: string,
 *     notes?: string
 *   }
 * }} input
 * @returns {{
 *   customerName: string,
 *   quantity: number,
 *   product: string,
 *   productType: string,
 *   printType: string,
 *   dueText: string,
 *   notes: string[],
 *   readyForCapture: boolean,
 *   reason: string
 * }}
 */
function convertLeadToCaptureData(input) {
  const src = input && typeof input === "object" ? input : {};
  const name = trim(src.name);
  const company = trim(src.company);
  const message = trim(src.message);
  const email = trim(src.email);
  const phone = trim(src.phone);
  const source = trim(src.source) || "unknown";
  const quote =
    src.quote && typeof src.quote === "object" ? src.quote : {};

  const customerName = name || company || "";

  let quantity = Math.floor(Number(quote.estimatedQuantity));
  if (!Number.isFinite(quantity) || quantity <= 0) quantity = 24;

  const product = inferProduct(message);
  const productType = product;
  const printType = inferPrintType(message);
  const dueText = extractDueHints(message);

  /** @type {string[]} */
  const notes = [
    `source: ${source}`,
    `message: ${message}`,
    `quote confidence: ${String(quote.confidence || "n/a")}`,
  ];
  if (email) notes.push(`email: ${email}`);
  if (phone) notes.push(`phone: ${phone}`);

  const readyForCapture = customerName.length > 0 && quantity > 0;
  let reason = "";
  if (!customerName) reason = "Missing customer name";
  else if (quantity <= 0) reason = "Invalid quantity";

  return {
    customerName,
    quantity,
    product,
    productType,
    printType,
    dueText,
    notes,
    readyForCapture,
    reason,
  };
}

/**
 * @param {unknown} body
 * @returns {{
 *   name: string,
 *   email: string,
 *   phone: string,
 *   company: string,
 *   message: string,
 *   source: string
 * }}
 */
function normalizeConvertBody(body) {
  const b = body && typeof body === "object" ? body : {};
  return {
    name: trim(b.name != null ? b.name : b.leadName),
    email: trim(b.email),
    phone: trim(b.phone),
    company: trim(b.company),
    message: trim(b.message),
    source: trim(b.source) || "unknown",
  };
}

/**
 * @param {unknown} body
 * @returns {{ quote: ReturnType<typeof computeQuickQuote>, captureData: ReturnType<typeof convertLeadToCaptureData> }}
 */
function buildLeadConversionPayload(body) {
  const fields = normalizeConvertBody(body);
  const quote = computeQuickQuote({
    message: fields.message,
    quantity:
      body &&
      typeof body === "object" &&
      body.quantity != null &&
      body.quantity !== ""
        ? body.quantity
        : null,
    printType: "",
    productType: "",
  });
  const captureData = convertLeadToCaptureData({ ...fields, quote });
  return { quote, captureData };
}

module.exports = {
  convertLeadToCaptureData,
  buildLeadConversionPayload,
  normalizeConvertBody,
  inferProduct,
  inferPrintType,
  extractDueHints,
};
