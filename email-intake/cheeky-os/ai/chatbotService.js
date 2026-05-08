"use strict";

/**
 * Shared read-only context builder for Cheeky conversational surfaces.
 * No execution paths, no approval bypass.
 */

const whatNowEngine = require("../operator/whatNowEngine");
const morningBriefEngine = require("../operator/morningBriefEngine");
const nightlyGrowthReviewEngine = require("../operator/nightlyGrowthReviewEngine");

async function gatherOperationalContext() {
  try {
    const wn = await whatNowEngine.buildWhatNowBrief();
    const mb = await morningBriefEngine.buildMorningBrief();
    const ng = await nightlyGrowthReviewEngine.buildNightlyGrowthReview();
    return { whatNow: wn, morningBrief: mb, nightlyReview: ng, degraded: false };
  } catch (_e) {
    return {
      whatNow: { topConcern: "unknown", changedSinceYesterday: "insufficient_data" },
      morningBrief: { topConcern: "unknown", changedSinceYesterday: "insufficient_data" },
      nightlyReview: { topConcern: "unknown", changedSinceYesterday: "insufficient_data" },
      degraded: true,
    };
  }
}

module.exports = {
  gatherOperationalContext,
};
