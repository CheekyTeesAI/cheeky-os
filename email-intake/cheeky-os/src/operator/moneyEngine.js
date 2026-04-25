"use strict";

module.exports = function moneyEngine(summary) {
  try {
    const result = {
      dailyTarget: 2000,
      current: 0,
      gap: 0,
      message: "",
    };

    // SIMPLE CALC (replace later with real Square data)
    const ordersToday = (((summary || {}).metrics || {}).ordersToday) || 0;

    result.current = ordersToday * 100; // placeholder avg ticket
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
