/**
 * Deterministic intake parsing — regex + heuristics (no OpenAI required).
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;

function pickFirst(re, text) {
  const m = String(text || "").match(re);
  return m && m[0] ? m[0].trim() : "";
}

function parseIntake(raw) {
  const subject = String((raw && raw.subject) || "").trim();
  const body = String((raw && raw.body) || "").trim();
  const combined = `${subject}\n${body}`;
  const lower = combined.toLowerCase();

  const emails = combined.match(EMAIL_RE) || [];
  const email = emails.length ? emails[0].toLowerCase() : "";

  const phones = combined.match(PHONE_RE) || [];
  const phone = phones.length ? phones[0] : "";

  let customerName = "";
  const fromName = raw && raw.from && raw.from.name ? String(raw.from.name).trim() : "";
  if (fromName) customerName = fromName;
  const dear = combined.match(/dear\s+([^,\n]+)/i);
  if (dear) customerName = dear[1].trim();
  if (!customerName && raw && raw.customerName) customerName = String(raw.customerName).trim();

  let company = "";
  const co = combined.match(/(?:company|from):\s*([^\n]+)/i);
  if (co) company = co[1].trim();

  let quantity = null;
  const qm = combined.match(/\b(\d{1,5})\s*(?:x\s*)?(?:pcs?|pieces?|shirts?|tees?|hoodies?|units?|items?)?\b/i);
  if (qm) quantity = Math.max(1, parseInt(qm[1], 10));
  const q2 = combined.match(/\bneed\s+(\d{1,5})\b/i);
  if (q2) quantity = Math.max(1, parseInt(q2[1], 10));

  let garment = "";
  if (/\bhoodie\b/i.test(combined)) garment = "hoodie";
  else if (/\bpolo\b/i.test(combined)) garment = "polo";
  else if (/\btee|t-shirt|tshirt|shirts?\b/i.test(combined)) garment = "tees";

  const sizes = [];
  const sizeWords = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];
  for (const s of sizeWords) {
    if (new RegExp(`\\b${s}\\b`, "i").test(combined)) sizes.push(s);
  }

  const colors = [];
  const colorWords =
    "black,white,navy,red,royal,gray,grey,heather,charcoal,kelly,forest,purple,pink,gold,yellow,orange"
      .split(",");
  for (const c of colorWords) {
    if (new RegExp(`\\b${c}\\b`, "i").test(lower)) colors.push(c);
  }

  const printLocations = [];
  if (/\bfront\b/i.test(combined)) printLocations.push("front");
  if (/\bback\b|full\s*back/i.test(combined)) printLocations.push("back");
  if (/\bchest|left\s*chest/i.test(combined)) printLocations.push("left chest");
  if (/\bsleeve\b/i.test(combined)) printLocations.push("sleeve");

  let printMethod = "";
  if (/\bembroid/i.test(combined)) printMethod = "EMBROIDERY";
  else if (/\bdtg|direct\s*to\s*garment/i.test(combined)) printMethod = "DTG";
  else if (/\bscreen\b|spot\s*color/i.test(combined)) printMethod = "SCREEN";
  else if (/\bdtf\b/i.test(combined)) printMethod = "DTF";

  let dueDate = null;
  const iso = combined.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) dueDate = iso[1];
  const may = combined.match(/\b(may|june|july|august|september|october|november|december|january|february|march|april)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?\b/i);
  if (may) dueDate = may[0];

  const nextFri = /\bnext\s+friday\b/i.test(combined);
  if (nextFri && !dueDate) {
    dueDate = "next_friday_relative";
  }

  const notes = body.slice(0, 8000);

  const reorderHints = /\bre-?order\b|\bsame\s+as\s+last\b|\brepeat\b|\blast\s+time\b/i.test(combined);

  const artworkMention =
    /\bart(work)?\b|\blogo\b|\bvector\b|\bfile\b|\battach/i.test(combined) ||
    /\bupload/i.test(combined);
  const attachmentMention = /\battach(ment)?s?\b|\buploaded\b|\bsee\s+attached/i.test(combined);

  let intent = "UNKNOWN";
  if (/\bwhere\s+is\s+my\b|\bstatus\b|\btracking\b|\bshipped\b|\bwhen\s+will\b/i.test(combined)) {
    intent = "STATUS_REQUEST";
  } else if (/\bre-?order\b|\bsame\s+as\b/i.test(combined)) {
    intent = "REORDER";
  } else if (attachmentMention && /\bproof\b|\bart\b/i.test(combined)) {
    intent = "ART_SUBMISSION";
  } else if (/\bquote\b|\bestimate\b|\bpricing\b|\bhow\s+much\b/i.test(combined)) {
    intent = "QUOTE_REQUEST";
  } else if (/\border\b|\bneed\s+\d+/i.test(combined) && quantity) {
    intent = "NEW_ORDER";
  } else if (/\bhello\b|\bquestion\b|\binfo\b/i.test(combined)) {
    intent = "GENERAL_QUESTION";
  }

  const extractedData = {
    customerName: customerName || undefined,
    company: company || undefined,
    email: email || undefined,
    phone: phone || undefined,
    quantity,
    garment: garment || undefined,
    sizes: sizes.length ? [...new Set(sizes)] : undefined,
    colors: colors.length ? [...new Set(colors)] : undefined,
    printLocations: printLocations.length ? [...new Set(printLocations)] : undefined,
    printMethod: printMethod || undefined,
    dueDate: dueDate || undefined,
    notes: notes || undefined,
    reorderHints,
    artworkMention,
    attachmentMention,
  };

  const missingFields = [];
  if (!extractedData.email && !email) missingFields.push("email");
  if (!quantity) missingFields.push("quantity");
  if (!garment) missingFields.push("garment_or_product");
  if (!sizes.length) missingFields.push("sizes");
  if (!colors.length) missingFields.push("colors");
  if (!dueDate || dueDate === "next_friday_relative") missingFields.push("due_date");
  if (!printLocations.length) missingFields.push("print_locations");

  const assumptions = [];
  if (dueDate === "next_friday_relative") assumptions.push("due_date_verbal_next_friday_needs_confirmation");
  if (!extractedData.email && fromName) assumptions.push("email_not_in_body_use_channel");

  let reviewRequired = false;
  if (intent === "UNKNOWN") reviewRequired = true;
  if (missingFields.length > 4) reviewRequired = true;

  return {
    intent,
    extractedData,
    missingFields,
    assumptions,
    reviewRequired,
  };
}

module.exports = {
  parseIntake,
};
