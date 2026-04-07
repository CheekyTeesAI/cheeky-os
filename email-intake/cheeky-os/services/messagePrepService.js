/**
 * Bundle 16 — short, ready-to-send copy templates (no AI, no DB).
 */

const TYPES = new Set(["followup", "invoice", "reactivation", "new_lead"]);

/**
 * @param {string} [full]
 */
function displayFirstName(full) {
  const s = String(full || "").trim();
  if (!s) return "there";
  const first = s.split(/\s+/)[0];
  return first || "there";
}

/**
 * @param {unknown} amt
 */
function formatAmount(amt) {
  const n = Number(amt);
  if (!Number.isFinite(n) || n <= 0) return "";
  const r = Math.round(n * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 0.001) return String(Math.round(r));
  return r.toFixed(2);
}

/**
 * @param {string} text
 * @param {unknown} amt
 */
function appendAmount(text, amt) {
  const f = formatAmount(amt);
  if (!f) return text;
  return `${text} It's around $${f}.`;
}

/**
 * @param {string} t
 * @returns {t is "followup"|"invoice"|"reactivation"|"new_lead"}
 */
function isKnownType(t) {
  return TYPES.has(t);
}

/**
 * @param {{ type?: string, customerName?: string, amount?: unknown, daysOld?: unknown }} input
 * @returns {{ message: string, type: string }}
 */
function prepareMessage(input) {
  const rawType = String((input && input.type) || "")
    .trim()
    .toLowerCase();
  const type = isKnownType(rawType) ? rawType : "followup";
  const name = displayFirstName(input && input.customerName);
  const daysOld = Number(input && input.daysOld);
  const urgent = Number.isFinite(daysOld) && daysOld > 7;
  const amt = input && input.amount;

  if (type === "new_lead") {
    let m =
      "Hey! We can definitely help you with that — want me to put together a quick mockup and quote?";
    m = appendAmount(m, amt);
    return { message: m, type: "new_lead" };
  }

  if (type === "reactivation") {
    let m = urgent
      ? `Hey ${name} — Patrick from Cheeky Tees here. Wanted to reach out while we still have production space this week if you need anything printed.`
      : `Hey ${name} — this is Patrick from Cheeky Tees. We've got production space this week if you need anything printed.`;
    m = appendAmount(m, amt);
    return { message: m, type: "reactivation" };
  }

  if (type === "invoice") {
    let m = urgent
      ? `Hey ${name} — quick nudge — I've got your invoice ready. As soon as you're good on that, we can get your order moving.`
      : `Hey ${name} — I've got your invoice ready. As soon as you're good on that, we can get your order moving.`;
    m = appendAmount(m, amt);
    return { message: m, type: "invoice" };
  }

  let m = urgent
    ? `Hey ${name} — circling back on your order — it's been a little while. Let me know if you'd like to move forward and I'll get you taken care of.`
    : `Hey ${name} — just checking in on your order from a few days ago. Let me know if you'd like to move forward and I'll get you taken care of.`;
  m = appendAmount(m, amt);
  return { message: m, type: "followup" };
}

module.exports = { prepareMessage, isKnownType, TYPES };
