/**
 * Dedupe, cooldown, and send eligibility for outbound communications.
 */
const { findRecentMatchingCommunication } = require("./communicationService");

const COOLDOWN_HOURS = {
  MISSING_INFO: 24,
  QUOTE_READY: 48,
  INVOICE_REMINDER: Number(process.env.COMM_COOLDOWN_INVOICE_HOURS || 24),
  DEPOSIT_REQUIRED: 24,
  PAYMENT_CONFIRMATION: 72,
  ART_NEEDED: 24,
  ART_APPROVAL_REQUEST: 24,
  JOB_STATUS_UPDATE: 12,
  READY_FOR_PICKUP: Number(process.env.COMM_COOLDOWN_PICKUP_HOURS || 12),
  FOLLOWUP_GENERAL: 24,
  PO_READY: 48,
  WORK_ORDER_NOTICE: 24,
  DIRECT_SHIP_CONFIRMATION: 48,
};

function buildDedupeKey(recommendation) {
  const r = recommendation && typeof recommendation === "object" ? recommendation : {};
  const type = String(r.type || r.templateKey || "GEN").toUpperCase();
  const rt = String(r.relatedType || "GENERAL").toUpperCase();
  const rid = String(r.relatedId || "").trim();
  const tk = String(r.templateKey || r.type || "FOLLOWUP_GENERAL").toUpperCase();
  const ch = String(r.channel || "EMAIL").toUpperCase();
  return `${rt}:${rid}:${tk}:${ch}:${type}`;
}

function getCooldownForTemplate(templateKey) {
  const tk = String(templateKey || "").toUpperCase();
  return COOLDOWN_HOURS[tk] != null ? COOLDOWN_HOURS[tk] : 24;
}

function hasChannelContact(recommendation, channel) {
  const ch = String(channel || "EMAIL").toUpperCase();
  const r = recommendation && typeof recommendation === "object" ? recommendation : {};
  if (ch === "EMAIL") {
    const e = r.toEmail || r.customerEmail;
    return typeof e === "string" && e.includes("@");
  }
  const phone = r.toPhone || r.customerPhone;
  const p = String(phone || "").replace(/\D/g, "");
  return p.length >= 10;
}

function isProviderAvailable(channel) {
  const ch = String(channel || "EMAIL").toUpperCase();
  if (ch === "EMAIL") {
    const key = String(process.env.RESEND_API_KEY || "").trim();
    return key.length > 0;
  }
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  const from = String(
    process.env.TWILIO_FROM || process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_NUMBER || ""
  ).trim();
  return !!(sid && token && from);
}

/**
 * @returns {{ allowed: boolean, reason: string, cooldownRemainingHours: number|null }}
 */
function canSendCommunication(recommendation, opts) {
  const o = opts && typeof opts === "object" ? opts : {};
  const mode = String(o.mode || "PREVIEW").toUpperCase();
  const skipDuplicateCheck = o.skipDuplicateCheck === true;
  const r = recommendation && typeof recommendation === "object" ? recommendation : {};

  if (mode === "PREVIEW") {
    return { allowed: true, reason: "PREVIEW", cooldownRemainingHours: null };
  }

  const ch = String(r.channel || "EMAIL").toUpperCase();
  if (!hasChannelContact(r, ch)) {
    return { allowed: false, reason: "NO_CONTACT", cooldownRemainingHours: null };
  }

  const tk = String(r.templateKey || r.type || "").toUpperCase();
  if (!skipDuplicateCheck) {
    const dedupeKey = r.dedupeKey || buildDedupeKey(r);
    const hours = getCooldownForTemplate(tk);
    const recent = findRecentMatchingCommunication(dedupeKey, hours);
    if (recent) {
      const created = new Date(recent.sentAt || recent.createdAt || 0).getTime();
      const elapsed = (Date.now() - created) / (3600 * 1000);
      const rem = Math.max(0, hours - elapsed);
      return {
        allowed: false,
        reason: "DUPLICATE_RECENT",
        cooldownRemainingHours: rem,
      };
    }
  }

  if (!isProviderAvailable(ch)) {
    return { allowed: false, reason: "PROVIDER_UNAVAILABLE", cooldownRemainingHours: null };
  }

  return { allowed: true, reason: "OK", cooldownRemainingHours: null };
}

module.exports = {
  buildDedupeKey,
  canSendCommunication,
  getCooldownForTemplate,
  hasChannelContact,
  isProviderAvailable,
};
