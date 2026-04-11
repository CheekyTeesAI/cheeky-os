"use strict";

/**
 * High-conversion closing message from profile + score.
 * @param {{ id?: string, name?: string, email?: string }} customerProfile
 * @param {number} score
 * @returns {{ subject: string, message: string, urgencyLevel: string }}
 */
function generateClosingMessage(customerProfile, score) {
  const rawName =
    customerProfile && typeof customerProfile.name === "string"
      ? customerProfile.name.trim()
      : "";
  const firstName = rawName ? rawName.split(/\s+/)[0] : "there";

  const urgencyLevel =
    score >= 70 ? "high" : score >= 40 ? "medium" : "standard";

  const subject =
    score >= 70
      ? "Same-day: lock your Cheeky Tees slot"
      : "Print slots open this week — quick close";

  const message = `Hey ${firstName} — we need a same-day decision today to hold your place; we have a few print slots open this week. Reply or approve estimate to lock your spot.`;

  return { subject, message, urgencyLevel };
}

module.exports = { generateClosingMessage };
