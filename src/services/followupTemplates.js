"use strict";

function getDisplayName(entity) {
  const raw = String((entity && (entity.customerName || entity.name)) || "").trim();
  if (!raw) return "there";
  const first = raw.split(/\s+/).filter(Boolean)[0];
  return first || "there";
}

function createDepositFollowupDraft(entity = {}) {
  const name = getDisplayName(entity);
  return {
    subject: "Deposit needed to begin your Cheeky Tees order",
    body:
      `Hi ${name},\n\n` +
      "Just a quick follow-up on your order with Cheeky Tees. " +
      "We are ready to move forward, but we still need the deposit before we can begin production and order garments.\n\n" +
      "If you are ready, reply here and we will help you get it handled.\n\n" +
      "Thanks,\nCheeky Tees",
  };
}

function createStaleQuoteNudgeDraft(entity = {}) {
  const name = getDisplayName(entity);
  return {
    subject: "Quick check-in on your Cheeky Tees quote",
    body:
      `Hi ${name},\n\n` +
      "Quick check-in on your quote from Cheeky Tees. " +
      "If you want to move forward, we can get everything lined up and ready.\n\n" +
      "Reply here and we will take care of the next step.\n\n" +
      "Thanks,\nCheeky Tees",
  };
}

module.exports = {
  createDepositFollowupDraft,
  createStaleQuoteNudgeDraft,
};
