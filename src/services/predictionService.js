"use strict";

const { getPrisma } = require("./decisionEngine");

function avgDaysBetween(dates) {
  if ((dates || []).length < 2) return 30;
  let total = 0;
  for (let i = 1; i < dates.length; i++) {
    total +=
      (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) /
      (1000 * 60 * 60 * 24);
  }
  return total / (dates.length - 1);
}

async function generatePredictions() {
  const prisma = getPrisma();
  if (!prisma) throw new Error("DB_UNAVAILABLE");

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { lineItems: true },
    take: 5000,
  });

  const map = {};
  for (const o of orders) {
    const key = o.email || o.phone || o.customerName;
    if (!key) continue;

    if (!map[key]) {
      map[key] = {
        customerName: o.customerName,
        dates: [],
        product: null,
        quantity: 0,
      };
    }

    map[key].dates.push(o.createdAt);

    const firstItem = o.lineItems && o.lineItems[0] ? o.lineItems[0] : null;
    if (!map[key].product && firstItem) {
      map[key].product = firstItem.description || null;
      map[key].quantity = firstItem.quantity || 0;
    }
  }

  const predictions = [];
  for (const key of Object.keys(map)) {
    const data = map[key];
    if ((data.dates || []).length < 2) continue;

    const avgDays = avgDaysBetween(data.dates);
    const nextDate = new Date(data.dates[0]);
    nextDate.setDate(nextDate.getDate() + avgDays);

    predictions.push({
      customerKey: key,
      customerName: data.customerName,
      predictedDate: nextDate,
      product: data.product,
      quantity: data.quantity,
      confidence: Math.min((data.dates.length || 0) / 5, 1),
    });
  }

  return predictions;
}

module.exports = { generatePredictions };
