"use strict";

function estimateRunwayDays(snapshot, obligations) {
  const assumptions = [];
  const blockers = [];
  const now = new Date().toISOString();

  const cashOnHand = snapshot && snapshot.liquidity && snapshot.liquidity.cashOnHand ? snapshot.liquidity.cashOnHand.value : null;
  const cashProxy =
    snapshot && snapshot.liquidity && snapshot.liquidity.usableCashProxy
      ? snapshot.liquidity.usableCashProxy.value
      : null;
  const known30 =
    snapshot && snapshot.outflows && snapshot.outflows.knownObligationsNext30Days
      ? snapshot.outflows.knownObligationsNext30Days.value
      : null;

  let liquidityBase = cashOnHand;
  let certainty = snapshot && snapshot.liquidity && snapshot.liquidity.cashOnHand
    ? snapshot.liquidity.cashOnHand.certainty
    : "unknown";

  if (liquidityBase === null || liquidityBase === undefined) {
    liquidityBase = cashProxy;
    certainty = snapshot && snapshot.liquidity && snapshot.liquidity.usableCashProxy
      ? snapshot.liquidity.usableCashProxy.certainty
      : "unknown";
    assumptions.push("cashOnHand unavailable, used usableCashProxy");
  } else {
    assumptions.push("used cashOnHand as primary liquidity");
  }

  if (liquidityBase === null || liquidityBase === undefined) {
    blockers.push("missing cashOnHand and usableCashProxy");
    return {
      runwayDays: null,
      certainty: "unknown",
      method: "insufficient_data",
      assumptions,
      blockers,
      timestamp: now,
    };
  }

  let burn30 = Number(known30 || 0);
  let method = "actual_known_obligations";
  if (!burn30 || burn30 <= 0) {
    const estimatedFromObligations = Array.isArray(obligations)
      ? obligations.reduce((sum, o) => sum + Number(o.amount || 0), 0)
      : 0;
    burn30 = Number(estimatedFromObligations || 0);
    method = burn30 > 0 ? "estimated_monthly_burn" : "insufficient_data";
    assumptions.push("used obligations feed to estimate monthly burn");
  } else {
    assumptions.push("used known obligations next 30 days");
  }

  if (!burn30 || burn30 <= 0) {
    blockers.push("missing monthly burn basis");
    return {
      runwayDays: null,
      certainty: "unknown",
      method: "insufficient_data",
      assumptions,
      blockers,
      timestamp: now,
    };
  }

  const dailyBurn = burn30 / 30;
  const runwayDays = Math.max(0, Math.floor(liquidityBase / dailyBurn));
  if (certainty === "actual" && method === "actual_known_obligations") {
    certainty = "estimated";
    assumptions.push("outflow basis includes operator-maintained obligations");
  }

  return {
    runwayDays,
    certainty,
    method,
    assumptions,
    blockers,
    timestamp: now,
  };
}

module.exports = {
  estimateRunwayDays,
};
