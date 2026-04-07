/**
 * Bundle 49 — ballpark quote from lead text (deterministic, no AI).
 */

const NOTES_DEFAULT =
  "Final pricing depends on artwork, garment, and print method.";

/**
 * @param {unknown} n
 * @returns {string}
 */
function fmtMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  const r = Math.round(x * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 0.001) return String(Math.round(r));
  return r.toFixed(2);
}

/**
 * @param {string} message
 * @returns {number | null}
 */
function extractQuantityFromMessage(message) {
  const s = String(message || "");
  const re = /\b(\d{1,5})\b/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= 6 && n <= 50000) return n;
  }
  return null;
}

/**
 * Midpoint ballpark $/shirt for tiered qty.
 * @param {number} qty
 * @returns {number}
 */
function pricePerShirtForQuantity(qty) {
  const q = Math.max(1, Math.floor(Number(qty) || 1));
  if (q <= 12) return 20;
  if (q <= 24) return 16;
  if (q <= 99) return 13.5;
  return 11.5;
}

/**
 * @param {string} full
 * @returns {string}
 */
function firstName(full) {
  const s = String(full || "").trim();
  if (!s) return "there";
  const p = s.split(/\s+/)[0];
  return p || "there";
}

/**
 * @param {{
 *   message?: string,
 *   quantity?: unknown,
 *   printType?: string,
 *   productType?: string
 * }} input
 * @returns {{
 *   estimatedQuantity: number,
 *   estimatedPricePerShirt: number,
 *   estimatedTotal: number,
 *   confidence: "low"|"medium"|"high",
 *   notes: string
 * }}
 */
function computeQuickQuote(input) {
  const src = input && typeof input === "object" ? input : {};
  const message = String(src.message || "").trim();

  let parsedFromMessage = extractQuantityFromMessage(message);
  let usedOverride = false;
  const qRaw = src.quantity;
  if (qRaw != null && qRaw !== "") {
    const qn = Math.floor(Number(qRaw));
    if (Number.isFinite(qn) && qn >= 6 && qn <= 50000) {
      parsedFromMessage = qn;
      usedOverride = true;
    }
  }

  const guessedQty = parsedFromMessage == null;
  const estimatedQuantity = guessedQty ? 24 : parsedFromMessage;

  const estimatedPricePerShirt = pricePerShirtForQuantity(estimatedQuantity);
  const estimatedTotal =
    Math.round(estimatedQuantity * estimatedPricePerShirt * 100) / 100;

  /** @type {"low"|"medium"|"high"} */
  let confidence = "medium";
  if (message.length < 4) {
    confidence = "low";
  } else if (!guessedQty || usedOverride) {
    confidence = "high";
  } else {
    confidence = "medium";
  }

  return {
    estimatedQuantity,
    estimatedPricePerShirt,
    estimatedTotal,
    confidence,
    notes: NOTES_DEFAULT,
  };
}

/**
 * Ready-to-send SMS/email draft (caller must send manually).
 * @param {string} name
 * @param {ReturnType<typeof computeQuickQuote>} quote
 * @returns {string}
 */
function buildLeadQuoteResponseMessage(name, quote) {
  const q = quote && typeof quote === "object" ? quote : computeQuickQuote({});
  const fn = firstName(name);
  const x = fmtMoney(q.estimatedPricePerShirt);
  const qty = String(Math.floor(Number(q.estimatedQuantity) || 0));
  const total = fmtMoney(q.estimatedTotal);
  return (
    `Hey ${fn} — thanks for reaching out.\n\n` +
    `For something like this, you're likely looking at around $${x}/shirt for about ${qty} pieces, so roughly $${total}.\n\n` +
    `That can vary a bit depending on the design and garment, but I can get you a precise quote quickly.\n\n` +
    `Want me to put that together for you?`
  );
}

module.exports = {
  computeQuickQuote,
  buildLeadQuoteResponseMessage,
  extractQuantityFromMessage,
  pricePerShirtForQuantity,
  fmtMoney,
  NOTES_DEFAULT,
};
