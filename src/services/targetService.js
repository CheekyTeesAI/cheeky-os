"use strict";

function getDailyTarget() {
  const monthlyGoal = 25000;
  const workingDays = 22;
  const dailyTarget = Math.round(monthlyGoal / workingDays);

  return {
    monthlyGoal,
    dailyTarget,
  };
}

module.exports = { getDailyTarget };
