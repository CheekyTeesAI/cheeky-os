/**
 * Single load path for executive brain — degrades per subsystem, never throws.
 */
const { getOperatingSystemJobs } = require("./foundationJobMerge");
const { getSquareDashboardBundle } = require("./squareSyncEngine");
const { getIntakeDashboardSnapshot, getIntakeRecords } = require("./intakeService");
const { buildWeeklyPlan } = require("./weekPlanner");
const { buildFullProductionReport } = require("./productionEngine");
const { buildPurchasePlan } = require("./purchasingPlanner");
const { getOutboundDashboardSlice } = require("./vendorOutboundEngine");
const { buildCommunicationRecommendations } = require("./communicationDecisionEngine");

async function loadExecutiveContext() {
  const partial = [];
  const assumptions = [
    "Figures use Square + merged jobs when available; pricing may be modeled where invoices are missing.",
    "Executive snapshot is advisory — verify money and dates in source systems before acting.",
  ];

  let jobs = [];
  try {
    jobs = await getOperatingSystemJobs();
  } catch (e) {
    partial.push("jobs_unavailable");
    jobs = [];
  }

  let squareBundle = {};
  try {
    squareBundle = await getSquareDashboardBundle();
  } catch (e) {
    partial.push("square_unavailable");
    squareBundle = {};
  }

  let intakeSnapshot = {};
  try {
    intakeSnapshot = getIntakeDashboardSnapshot();
  } catch (e) {
    partial.push("intake_unavailable");
    intakeSnapshot = {};
  }

  let intakeRecords = [];
  try {
    intakeRecords = getIntakeRecords({ limit: 120 });
  } catch (e) {
    partial.push("intake_records_unavailable");
    intakeRecords = [];
  }

  let weeklyPlan = null;
  let scheduleMock = false;
  try {
    const plan = await buildWeeklyPlan(jobs);
    weeklyPlan = plan;
    scheduleMock = Boolean(plan && plan.mock);
  } catch (e) {
    partial.push("schedule_unavailable");
    weeklyPlan = null;
  }

  let production = { ready: [], blocked: [], queue: [], batches: [] };
  try {
    production = buildFullProductionReport(jobs);
  } catch (e) {
    partial.push("production_unavailable");
  }

  let purchasePlan = null;
  let purchaseMock = false;
  try {
    purchasePlan = await buildPurchasePlan(jobs);
    purchaseMock = Boolean(purchasePlan && purchasePlan.mock);
  } catch (e) {
    partial.push("purchasing_unavailable");
    purchasePlan = null;
  }

  let outbound = {};
  try {
    outbound = getOutboundDashboardSlice();
  } catch (e) {
    partial.push("vendor_outbound_unavailable");
    outbound = {};
  }

  let communications = { recommendations: [], meta: {} };
  try {
    communications = await buildCommunicationRecommendations();
  } catch (e) {
    partial.push("communications_unavailable");
    communications = { recommendations: [], meta: {} };
  }

  const squareMock = Boolean(squareBundle.squareStatus && squareBundle.squareStatus.mock);
  const mock = squareMock || scheduleMock || purchaseMock || partial.length > 0;

  return {
    jobs,
    squareBundle,
    intakeSnapshot,
    intakeRecords,
    weeklyPlan,
    production,
    purchasePlan,
    outbound,
    communications,
    partial,
    assumptions,
    mock,
  };
}

module.exports = {
  loadExecutiveContext,
};
