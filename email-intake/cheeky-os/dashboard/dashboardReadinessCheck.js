"use strict";

const path = require("path");

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_e) {
    return null;
  }
}

function squareConfigured() {
  try {
    const sq = require("../connectors/squareReadConnector");
    return !!(sq && typeof sq.isConfiguredSync === "function" && sq.isConfiguredSync());
  } catch (_e) {
    return false;
  }
}

function graphConfigured() {
  try {
    const ge = require("../connectors/graphEmailConnector");
    return typeof ge.isConfigured === "function" && ge.isConfigured();
  } catch (_e) {
    return false;
  }
}

/**
 * @returns {{
 *   ready: boolean,
 *   blockers: string[],
 *   warnings: string[],
 *   availableSections: string[],
 *   missingSections: string[],
 *   recommendedNextStep: string
 * }}
 */
function runDashboardReadiness() {
  const blockers = [];
  const warnings = [];
  /** @type {string[]} */
  const availableSections = [];
  /** @type {string[]} */
  const missingSections = [];

  const prisma = getPrisma();
  const dbOk = !!(prisma && prisma.order);

  if (dbOk) {
    availableSections.push("live_orders_prisma");
  } else {
    blockers.push("no_prisma_orders");
    missingSections.push("database_orders");
    warnings.push("Connect DATABASE_URL — operator cards will stay on mock_fallback until orders load.");
  }

  if (squareConfigured()) {
    availableSections.push("square_reads");
  } else {
    missingSections.push("square_live");
    warnings.push("Square tokens unset — unpaid invoice hints may be placeholders.");
  }

  if (graphConfigured()) {
    availableSections.push("graph_mailbox_reads");
  } else {
    missingSections.push("graph_mailbox_reads");
    warnings.push("MS_GRAPH_* unset — inbox command answers degraded.");
  }

  let recommendedNextStep = "Open GET /api/dashboard/readiness after boot; inspect /cheeky-os-ui/operator-dashboard.html.";
  if (!dbOk) {
    recommendedNextStep = "Point DATABASE_URL at your Postgres instance and migrate Prisma for live dashboards.";
  } else if (!squareConfigured()) {
    recommendedNextStep = "Set Square env for sharper cash-risk cards (still usable with mocks).";
  }

  /** Ready when DB-backed orders visible (mock-only is not \"ops ready\") */
  const ready = dbOk;

  return {
    ready,
    blockers,
    warnings,
    availableSections,
    missingSections,
    recommendedNextStep,
  };
}

module.exports = {
  runDashboardReadiness,
};
