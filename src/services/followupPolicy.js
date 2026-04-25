"use strict";

const HOURS = 60 * 60 * 1000;
const FOLLOWUP_COOLDOWNS = {
  DEPOSIT_FOLLOWUP: 24 * HOURS,
  STALE_QUOTE_NUDGE: 48 * HOURS,
  GENERAL_REMINDER: 72 * HOURS,
};

function isFollowupEnabled() {
  return String(process.env.AUTO_FOLLOWUP || "false").toLowerCase() === "true";
}

function isDraftOnlyMode() {
  return String(process.env.FOLLOWUP_MODE || "draft_only").toLowerCase() === "draft_only";
}

function canAutoSendFollowup() {
  if (!isFollowupEnabled()) return false;
  if (isDraftOnlyMode()) return false;
  return String(process.env.FOLLOWUP_AUTO_SEND || "false").toLowerCase() === "true";
}

function hasContactInfo(entity) {
  if (!entity || typeof entity !== "object") return false;
  const email = String(entity.email || "").trim();
  const phone = String(entity.phone || "").trim();
  return Boolean(email || phone);
}

function isWithinCooldown(lastSentAt, type) {
  const date = lastSentAt ? new Date(lastSentAt) : null;
  const t = date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
  if (!t) return false;
  const cooldownMs = FOLLOWUP_COOLDOWNS[type] || FOLLOWUP_COOLDOWNS.GENERAL_REMINDER;
  return Date.now() - t < cooldownMs;
}

function canFollowUpOrder(order, type, options = {}) {
  if (!order || typeof order !== "object") return false;
  if (!hasContactInfo(order)) return false;
  const status = String(order.status || "").toUpperCase();
  if (status === "COMPLETED" || status === "CANCELLED") return false;
  if (String(type || "").toUpperCase() !== "READY_TO_MOVE_INTERNAL" && order.depositPaidAt) return false;
  if (options && options.confidenceLow) return false;
  if (options && options.linkageMissing) return false;
  if (isWithinCooldown(options.lastSentAt, type)) return false;
  return true;
}

function canFollowUpLead(lead, type, options = {}) {
  if (!lead || typeof lead !== "object") return false;
  if (!hasContactInfo(lead)) return false;
  const status = String(lead.status || "").toUpperCase();
  if (status === "COMPLETED" || status === "CANCELLED") return false;
  if (String(lead.paymentStatus || "").toUpperCase() === "PAID") return false;
  if (options && options.confidenceLow) return false;
  if (options && options.linkageMissing) return false;
  if (isWithinCooldown(options.lastSentAt, type)) return false;
  return true;
}

module.exports = {
  isFollowupEnabled,
  isDraftOnlyMode,
  canAutoSendFollowup,
  canFollowUpOrder,
  canFollowUpLead,
  isWithinCooldown,
  FOLLOWUP_COOLDOWNS,
};
