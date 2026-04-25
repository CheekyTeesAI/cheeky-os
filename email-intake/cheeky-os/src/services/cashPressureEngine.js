"use strict";

const { getCashSnapshot } = require("./cashSnapshot");
const { getUpcomingObligations } = require("./obligationsTracker");
const { estimateRunwayDays } = require("./runwayEstimator");
const { canRecommendCashAction } = require("./cashPolicy");

function makePriority(data) {
  return {
    id: data.id,
    category: data.category,
    priority: data.priority,
    title: data.title,
    recommendedAction: data.recommendedAction,
    reason: data.reason,
    expectedImpact: data.expectedImpact,
    certainty: data.certainty || "estimated",
    entityType: data.entityType || "cash",
    entityId: data.entityId || null,
    timestamp: new Date().toISOString(),
  };
}

function rankValue(priority) {
  if (priority === "critical") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

async function getCashPriorities() {
  const snapshot = await getCashSnapshot();
  const obligations = getUpcomingObligations();
  const runway = estimateRunwayDays(snapshot, obligations);
  const list = [];

  if (runway.runwayDays !== null && runway.runwayDays < 7) {
    list.push(
      makePriority({
        id: "runway-risk-critical",
        category: "pressure",
        priority: "critical",
        title: "Runway below 7 days",
        recommendedAction: "collect_deposit",
        reason: `Runway estimated at ${runway.runwayDays} days`,
        expectedImpact: "Improve short-term liquidity and reduce shutdown risk",
        certainty: runway.certainty,
      })
    );
    if (canRecommendCashAction("delay_nonessential_spend")) {
      list.push(
        makePriority({
          id: "freeze-nonessential-spend",
          category: "pressure",
          priority: "critical",
          title: "Review nonessential spending immediately",
          recommendedAction: "delay_nonessential_spend",
          reason: "Survival mode triggered by runway pressure",
          expectedImpact: "Preserve cash for required obligations",
          certainty: "estimated",
        })
      );
    }
  }

  const due3 = obligations.filter((o) => o.daysUntilDue !== null && o.daysUntilDue <= 3 && o.daysUntilDue >= 0);
  const due3Total = due3.reduce((sum, o) => sum + Number(o.amount || 0), 0);
  const knownLiquidity = snapshot.liquidity.cashOnHand.value ?? snapshot.liquidity.usableCashProxy.value;
  if (knownLiquidity !== null && due3Total > knownLiquidity) {
    list.push(
      makePriority({
        id: "cash-shortfall-risk",
        category: "pressure",
        priority: "critical",
        title: "Obligations due in 3 days exceed liquidity",
        recommendedAction: "flag_runway_risk",
        reason: `Due soon=${due3Total} > liquidity=${knownLiquidity}`,
        expectedImpact: "Prevent missed essential payments",
        certainty: "estimated",
      })
    );
  }

  obligations
    .filter((o) => (o.type === "tax" || o.type === "loan") && o.daysUntilDue !== null && o.daysUntilDue <= 7 && o.daysUntilDue >= 0)
    .forEach((o) => {
      list.push(
        makePriority({
          id: `obligation-${o.id}`,
          category: "pressure",
          priority: o.daysUntilDue <= 3 ? "critical" : "high",
          title: `${o.label} due soon`,
          recommendedAction: "flag_runway_risk",
          reason: `${o.type} obligation due in ${o.daysUntilDue} days`,
          expectedImpact: "Reduce penalty or compliance risk",
          certainty: o.certainty,
          entityType: "obligation",
          entityId: o.id,
        })
      );
    });

  const vendorExposure = Number(snapshot.outflows.vendorExposure.value || 0);
  const unpaidDeposits = Number(snapshot.inflows.unpaidDeposits.value || 0);
  if (vendorExposure > 0 && vendorExposure > unpaidDeposits) {
    list.push(
      makePriority({
        id: "vendor-exposure-pressure",
        category: "pressure",
        priority: "high",
        title: "Vendor exposure ahead of secured deposits",
        recommendedAction: "review_vendor_commitment",
        reason: `Vendor exposure ${vendorExposure} exceeds unpaid deposit coverage ${unpaidDeposits}`,
        expectedImpact: "Avoid cash outflow ahead of collection",
        certainty: "estimated",
      })
    );
  }

  if (unpaidDeposits > 0) {
    list.push(
      makePriority({
        id: "collect-unpaid-deposits",
        category: "opportunity",
        priority: "high",
        title: "Unpaid deposits available to collect",
        recommendedAction: "collect_deposit",
        reason: `${snapshot.inflows.unpaidDeposits.count} orders awaiting deposit`,
        expectedImpact: `Potential inflow ${unpaidDeposits}`,
        certainty: snapshot.inflows.unpaidDeposits.certainty,
      })
    );
  }

  const outstandingInvoiceValue = Number(snapshot.inflows.outstandingInvoiceValue.value || 0);
  if (outstandingInvoiceValue > 0) {
    list.push(
      makePriority({
        id: "invoice-followup-priority",
        category: "opportunity",
        priority: "high",
        title: "Outstanding invoices need follow-up",
        recommendedAction: "prioritize_invoice_followup",
        reason: `Outstanding invoice value ${outstandingInvoiceValue}`,
        expectedImpact: "Accelerate receivables conversion",
        certainty: snapshot.inflows.outstandingInvoiceValue.certainty,
      })
    );
  }

  list.sort((a, b) => rankValue(b.priority) - rankValue(a.priority));
  return list;
}

module.exports = {
  getCashPriorities,
};
