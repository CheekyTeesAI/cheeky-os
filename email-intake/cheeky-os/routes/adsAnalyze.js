/**
 * GET /api/ads/analyze — mock Ads metrics + OpenAI insights.
 */

const express = require("express");
const path = require("path");
const router = express.Router();

const googleAdsAgent = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "modules",
  "googleAdsAgent.js"
));
const googleAdsMock = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "googleAds.js"
));

router.get("/report", async (_req, res) => {
  try {
    return res.json({
      success: true,
      source: "mock",
      data: googleAdsMock.getCampaignReport(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg, data: { source: "mock", campaigns: [] } });
  }
});

router.get("/analyze", async (_req, res) => {
  let source = "mock";
  let campaigns = googleAdsAgent.getAdsData();

  try {
    const real = await googleAdsAgent.getRealAdsData();
    if (Array.isArray(real)) {
      campaigns = real;
      source = "real";
    }
  } catch (err) {
    console.error(
      "[ads/analyze] Google Ads API unavailable, using mock:",
      err instanceof Error ? err.message : err
    );
    source = "mock";
    campaigns = googleAdsAgent.getAdsData();
  }

  try {
    const insights = await googleAdsAgent.analyzeAds(campaigns);
    return res.json({
      success: true,
      source,
      insights,
      campaigns,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      source,
      insights: "",
      campaigns,
      error: msg,
    });
  }
});

module.exports = router;
