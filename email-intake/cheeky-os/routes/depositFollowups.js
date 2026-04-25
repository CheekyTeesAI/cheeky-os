/**
 * GET /operator/deposit-followups — mirrors GET /api/operator/deposit-followups
 * Implementation: compiled service in dist (run `npm run build` in email-intake).
 */

const express = require("express");
const path = require("path");

const router = express.Router();

function getBuildDepositFollowupsPayload() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "depositFollowupService.js"
    )).buildDepositFollowupsPayload;
  } catch {
    return null;
  }
}

router.get("/deposit-followups", async (_req, res) => {
  const fn = getBuildDepositFollowupsPayload();
  if (!fn) {
    return res.status(503).json({
      success: false,
      error:
        "Deposit follow-up module not loaded — run `npm run build` from email-intake",
    });
  }
  try {
    const body = await fn();
    return res.json(body);
  } catch (err) {
    console.error("[deposit-followups]", err.message || err);
    return res.json({
      success: true,
      count: 0,
      items: [],
      alerts: [],
      warning: err instanceof Error ? err.message : "error",
    });
  }
});

module.exports = router;
