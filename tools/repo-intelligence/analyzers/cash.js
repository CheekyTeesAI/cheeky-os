// CHEEKY RIE — Cash-Priority Scorer (NEW v4.6)
"use strict";

const CASH_KEYWORDS = [
  "deposit", "payment", "invoice", "order", "followup",
  "follow-up", "square", "revenue", "balance", "collect",
  "lead", "quote", "money", "cash"
];

const SCORE_WEIGHTS = {
  hasRoute:           3,
  serviceNotUsed:     4,
  hasStub:            2,
  touchesOrders:      5,
  touchesDeposit:     5,
  touchesFollowUp:    4,
  isDisconnected:     6,
  touchesSquare:      3
};

function scoreItem(item) {
  let score = 0;
  const text = JSON.stringify(item).toLowerCase();

  if (item.hasRoute && !item.hasService)        score += SCORE_WEIGHTS.hasRoute;
  if (item.hasService && item.usageCount === 0) score += SCORE_WEIGHTS.serviceNotUsed;
  if (item.hasStub)                             score += SCORE_WEIGHTS.hasStub;
  if (item.isDisconnected)                      score += SCORE_WEIGHTS.isDisconnected;

  CASH_KEYWORDS.forEach(kw => {
    if (text.includes(kw)) score += SCORE_WEIGHTS.touchesOrders;
  });

  return Math.min(score, 30);
}

function rankByCashImpact(items) {
  return items
    .map(item => ({ ...item, cashScore: scoreItem(item) }))
    .sort((a, b) => b.cashScore - a.cashScore);
}

module.exports = { scoreItem, rankByCashImpact };
