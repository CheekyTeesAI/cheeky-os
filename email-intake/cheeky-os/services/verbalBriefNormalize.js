/**
 * Bundle 9 — map quick-entry parse + raw brief into normalized fields for founder logic.
 */

function inferPaymentStatus(rawText) {
  const t = String(rawText == null ? "" : rawText).toLowerCase();
  if (/\bnot\s*-?\s*paid\b|\bunpaid\b/.test(t)) return "not_paid";
  if (t.includes("deposit paid")) return "paid";
  if (/\bpaid\b/.test(t) && !/\bnot\s*-?\s*paid\b/.test(t) && !t.includes("unpaid")) {
    return "paid";
  }
  return "";
}

/**
 * @param {{
 *   customer?: string,
 *   quantity?: number,
 *   product?: string,
 *   print?: string,
 *   due?: string,
 * }} parsed
 * @param {unknown} rawText
 */
function normalizeVerbalBrief(parsed, rawText) {
  const p = parsed || {};
  const customerName = String(p.customer != null ? p.customer : "").trim();
  const quantity = Math.max(0, Math.floor(Number(p.quantity) || 0));
  const product = String(p.product != null ? p.product : "").trim();
  const print = String(p.print != null ? p.print : "").trim();
  const dueText = String(p.due != null ? p.due : "").trim();
  const raw = String(rawText != null ? rawText : "");

  const flags = [];

  let productType = "unknown";
  if (/hoodie/i.test(product)) productType = "hoodie";
  else if (/shirt/i.test(product)) productType = "shirt";

  if (productType === "unknown") {
    flags.push("unknown_product");
  }

  let printType = print;
  if (!print) {
    printType = "unknown";
    flags.push("unknown_print");
  }

  let filled = 0;
  if (customerName) filled++;
  if (quantity > 0) filled++;
  if (product) filled++;
  if (print) filled++;
  if (dueText) filled++;

  /** @type {"low"|"medium"|"high"} */
  let confidence = "low";
  if (filled >= 5) confidence = "high";
  else if (filled >= 3) confidence = "medium";

  return {
    customerName,
    quantity,
    product,
    productType,
    printType,
    dueText,
    flags: [...new Set(flags)],
    confidence,
    status: "",
    paymentStatus: inferPaymentStatus(raw),
    rawText: raw,
  };
}

module.exports = { normalizeVerbalBrief, inferPaymentStatus };
