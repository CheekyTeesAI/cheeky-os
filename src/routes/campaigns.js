"use strict";

const express = require("express");
const router = express.Router();

const {
  createCampaign,
  buildCampaign,
  getCampaigns,
  getCampaignTargets,
  markCampaignTarget,
} = require("../services/campaignService");

router.post("/api/campaigns", async (req, res) => {
  try {
    const { name, type } = req.body || {};
    const campaign = await createCampaign(name || "New Campaign", type || "REACTIVATION");
    return res.json({
      success: true,
      data: campaign,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "campaign_create_failed",
      code: "CAMPAIGN_CREATE_FAILED",
    });
  }
});

router.post("/api/campaigns/:id/build", async (req, res) => {
  try {
    const campaign = await buildCampaign(req.params.id);
    return res.json({
      success: true,
      data: campaign,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "campaign_build_failed",
      code: "CAMPAIGN_BUILD_FAILED",
    });
  }
});

router.get("/api/campaigns", async (_req, res) => {
  try {
    const campaigns = await getCampaigns();
    return res.json({
      success: true,
      data: campaigns,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "campaign_list_failed",
      code: "CAMPAIGN_LIST_FAILED",
    });
  }
});

router.get("/api/campaigns/:id/targets", async (req, res) => {
  try {
    const targets = await getCampaignTargets(req.params.id);
    return res.json({
      success: true,
      data: targets,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "campaign_targets_failed",
      code: "CAMPAIGN_TARGETS_FAILED",
    });
  }
});

router.post("/api/campaign-targets/:id/status", async (req, res) => {
  try {
    const { status } = req.body || {};
    const updated = await markCampaignTarget(req.params.id, status || "CONTACTED");
    return res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "campaign_target_update_failed",
      code: "CAMPAIGN_TARGET_UPDATE_FAILED",
    });
  }
});

module.exports = router;
