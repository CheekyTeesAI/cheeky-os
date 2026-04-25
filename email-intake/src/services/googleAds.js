/**
 * Safe-mode Google Ads Engine (mock only).
 */

function getCampaignReport() {
  return {
    source: "mock",
    campaigns: [
      {
        campaign: "Local T-Shirt Orders",
        impressions: 5000,
        clicks: 120,
        cost: 240,
        conversions: 6,
      },
      {
        campaign: "Custom Printing Greenville",
        impressions: 3000,
        clicks: 80,
        cost: 200,
        conversions: 2,
      },
    ],
  };
}

module.exports = { getCampaignReport };
