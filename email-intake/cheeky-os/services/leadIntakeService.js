/**
 * Bundle 48 — normalize inbound lead payloads (deterministic, no DB).
 */

const KNOWN_SOURCES = new Set(["website", "google_ads", "manual", "unknown"]);

/**
 * @param {unknown} v
 * @returns {string}
 */
function trimStr(v) {
  return String(v == null ? "" : v)
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @param {unknown} s
 * @returns {"website"|"google_ads"|"manual"|"unknown"}
 */
function normalizeSource(s) {
  const raw = trimStr(s).toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "google" || raw === "googleads") return "google_ads";
  if (raw === "web" || raw === "site") return "website";
  if (raw === "manual" || raw === "hand" || raw === "hand_entered") return "manual";
  if (KNOWN_SOURCES.has(raw)) return /** @type {any} */ (raw);
  return "unknown";
}

/**
 * @param {{
 *   name?: string,
 *   email?: string,
 *   phone?: string,
 *   company?: string,
 *   message?: string,
 *   source?: string
 * }} raw
 * @returns {{
 *   leadName: string,
 *   email: string,
 *   phone: string,
 *   company: string,
 *   message: string,
 *   source: string,
 *   quality: "low"|"medium"|"high",
 *   flags: string[]
 * }}
 */
function normalizeInboundLead(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const leadName = trimStr(src.name);
  const email = trimStr(src.email);
  const phone = trimStr(src.phone);
  const company = trimStr(src.company);
  const message = trimStr(src.message);
  const source = normalizeSource(src.source);

  const hasName = leadName.length > 0;
  const hasContact = email.length > 0 || phone.length > 0;
  const msgLen = message.length;
  const messageUseful = msgLen > 20;

  /** @type {"low"|"medium"|"high"} */
  let quality = "low";
  if (!hasName || !hasContact) {
    quality = "low";
  } else if (messageUseful) {
    quality = "high";
  } else {
    quality = "medium";
  }

  /** @type {string[]} */
  const flags = [];
  if (!hasName) flags.push("missing_name");
  if (!hasContact) flags.push("missing_contact");
  if (msgLen <= 20) flags.push("weak_message");
  if (source === "google_ads") flags.push("google_ads_lead");
  if (source === "website") flags.push("website_lead");

  return {
    leadName,
    email,
    phone,
    company,
    message,
    source,
    quality,
    flags,
  };
}

module.exports = {
  normalizeInboundLead,
  normalizeSource,
};
