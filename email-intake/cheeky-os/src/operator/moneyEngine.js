"use strict";

// [CHEEKY-GATE] CHEEKY_computeRevenue — reads real amountPaid from summary if available.
// Falls back to ordersToday × $100 placeholder when revenueToday is not yet populated.
function CHEEKY_computeRevenue(summary) {
  const metrics = (summary || {}).metrics || {};
  if (typeof metrics.revenueToday === "number" && metrics.revenueToday > 0) {
    return metrics.revenueToday;
  }
  const ordersToday = Number(metrics.ordersToday) || 0;
  return ordersToday * 100; // fallback placeholder avg ticket
}

module.exports = function moneyEngine(summary) {
  try {
    const result = {
      dailyTarget: 2000,
      current: 0,
      gap: 0,
      message: "",
    };

    result.current = CHEEKY_computeRevenue(summary);
    result.gap = result.dailyTarget - result.current;

    if (result.gap > 0) {
      result.message = `Need $${result.gap} more today`;
    } else {
      result.message = "Target hit — keep pushing";
    }

    return result;
  } catch (_) {
    return {
      dailyTarget: 0,
      current: 0,
      gap: 0,
      message: "Error calculating money",
    };
  }
};
