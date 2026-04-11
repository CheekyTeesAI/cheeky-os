/**
 * Bundle 38 — deterministic deposit-collection scoring (no DB / no AI).
 */

/**
 * @typedef {object} DepositPriorityInput
 * @property {string} [orderId]
 * @property {string} [customerName]
 * @property {string} [customerId]
 * @property {string} [phone]
 * @property {string} [email]
 * @property {number} [amount]
 * @property {string} [status]
 * @property {string} [paymentStatus]
 * @property {boolean} [depositRequired]
 * @property {boolean} [depositReceived]
 * @property {string} [pricingStatus]
 * @property {string} [priority]
 * @property {string} [dueText]
 * @property {string} [recommendedAction]
 * @property {boolean} [readyForProduction]
 */

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * @param {DepositPriorityInput} input
 * @returns {{ score: number, depositPriority: string, reason: string, flags: string[] }}
 */
function scoreDepositOpportunity(input) {
  const o = input && typeof input === "object" ? input : {};
  const flags = [];
  let score = 0;

  const amount = Number(o.amount) || 0;
  if (amount >= 1000) score += 30;
  else if (amount >= 500) score += 20;
  else if (amount >= 200) score += 10;

  const phone = String(o.phone || "").trim();
  const email = String(o.email || "").trim();
  if (phone) score += 10;
  if (email) score += 5;

  const depReq = o.depositRequired !== false;
  const depRec = o.depositReceived === true;
  if (depReq && !depRec) {
    score += 20;
    flags.push("deposit_needed");
  }

  const paySt = String(o.paymentStatus || "").trim().toLowerCase();
  if (paySt === "not_paid") score += 10;

  const st = String(o.status || "").trim().toUpperCase();
  if (st === "QUOTE" || st === "DEPOSIT") score += 15;

  const readyForProd = !!o.readyForProduction;
  if (readyForProd) {
    score += 10;
    flags.push("payment_blocking_production");
  }

  const pricingStatus = String(o.pricingStatus || "clear").toLowerCase();
  if (pricingStatus === "clear") score += 10;
  else if (pricingStatus === "review") score -= 10;
  else if (pricingStatus === "blocked") {
    score -= 100;
    flags.push("pricing_blocked");
  }

  const dueRaw = String(o.dueText || "");
  const due = dueRaw.toLowerCase();
  let urgency = false;
  if (due.includes("today") || due.includes("tomorrow") || due.includes("urgent")) {
    urgency = true;
  }
  if (!urgency) {
    for (const w of WEEKDAYS) {
      if (due.includes(w)) {
        urgency = true;
        break;
      }
    }
  }
  if (urgency) score += 10;

  const pri = String(o.priority || "").trim().toLowerCase();
  if (pri === "high" || pri === "critical") score += 5;

  const ra = String(o.recommendedAction || "").toLowerCase();
  if (ra.includes("deposit")) score += 15;
  if (ra.includes("invoice")) score += 10;

  if (amount >= 500) flags.push("high_value");
  if (phone || email) flags.push("contactable");
  else flags.push("weak_contact_data");

  /** @type {"low" | "medium" | "high" | "critical"} */
  let depositPriority = "low";
  if (score >= 60) depositPriority = "critical";
  else if (score >= 40) depositPriority = "high";
  else if (score >= 20) depositPriority = "medium";

  if (pricingStatus === "blocked") {
    depositPriority = "low";
  }

  const reasonParts = [];
  reasonParts.push(`$${Math.round(amount)}`);
  if (depReq && !depRec) reasonParts.push("deposit needed");
  if (phone) reasonParts.push("phone");
  if (email) reasonParts.push("email");
  if (readyForProd) reasonParts.push("ready but blocked by payment");
  else if (st === "QUOTE" || st === "DEPOSIT") reasonParts.push(`${st.toLowerCase()} stage`);
  if (paySt === "not_paid") reasonParts.push("not paid");
  if (urgency && dueRaw.trim()) reasonParts.push("urgent timeline");

  return {
    score: Math.round(score),
    depositPriority,
    reason: reasonParts.length ? reasonParts.join(" + ") : "Deposit collection",
    flags: Array.from(new Set(flags)),
  };
}

module.exports = { scoreDepositOpportunity };
