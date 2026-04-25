"use strict";

function scoreOrder(order) {
  let score = 0;
  const row = order && typeof order === "object" ? order : {};

  if (row.dueDate) {
    const due = new Date(row.dueDate).getTime();
    const now = Date.now();
    const diffDays = (due - now) / (1000 * 60 * 60 * 24);

    if (diffDays < 2) score += 100;
    else if (diffDays < 5) score += 50;
    else score += 10;
  }

  const qty = (Array.isArray(row.lineItems) ? row.lineItems : []).reduce(
    (sum, i) => sum + Number(i && i.quantity ? i.quantity : 0),
    0
  );
  score += Math.min(qty, 100);

  if (row.garmentsReceived) score += 40;
  if (row.depositPaid) score += 20;

  return score;
}

module.exports = { scoreOrder };
