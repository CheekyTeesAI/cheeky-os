/**
 * Bundle 3 — best-effort parse of quick notebook / whiteboard lines (no AI).
 */

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * @param {unknown} rawText
 * @returns {{
 *   customer: string,
 *   quantity: number,
 *   product: string,
 *   print: string,
 *   due: string
 * }}
 */
function parseQuickCapture(rawText) {
  const empty = () => ({
    customer: "",
    quantity: 0,
    product: "",
    print: "",
    due: "",
  });

  try {
    const text = String(rawText == null ? "" : rawText).trim();
    if (!text) return empty();

    const words = text.split(/\s+/).filter(Boolean);
    const out = empty();

    if (words.length >= 2) {
      out.customer = `${words[0]} ${words[1]}`.trim();
    } else if (words.length === 1) {
      out.customer = words[0];
    }

    for (const w of words) {
      if (/^\d+$/.test(w)) {
        const n = parseInt(w, 10);
        if (!Number.isNaN(n)) {
          out.quantity = n;
          break;
        }
      }
    }

    const lower = text.toLowerCase();
    if (lower.includes("hoodies")) out.product = "hoodies";
    else if (lower.includes("hoodie")) out.product = "hoodie";
    else if (lower.includes("shirts")) out.product = "shirts";
    else if (lower.includes("shirt")) out.product = "shirt";

    if (lower.includes("front") && lower.includes("back")) {
      out.print = "front/back";
    } else if (lower.includes("front")) {
      out.print = "front";
    } else if (lower.includes("back")) {
      out.print = "back";
    }

    let dueSet = false;
    for (const d of DAYS) {
      if (lower.includes(d)) {
        out.due = d.charAt(0).toUpperCase() + d.slice(1);
        dueSet = true;
        break;
      }
    }
    if (!dueSet && lower.includes("next week")) {
      out.due = "next week";
      dueSet = true;
    }
    if (!dueSet && lower.includes("tomorrow")) {
      out.due = "tomorrow";
    }

    return out;
  } catch {
    return empty();
  }
}

module.exports = { parseQuickCapture };
