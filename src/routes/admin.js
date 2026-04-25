"use strict";

const express = require("express");
const router = express.Router();

const { getAllSettings, setSetting } = require("../services/settingsService");

router.get("/api/admin/settings", async (_req, res) => {
  try {
    const list = await getAllSettings();
    return res.json({
      success: true,
      data: list,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "admin_settings_fetch_failed",
    });
  }
});

router.post("/api/admin/settings", async (req, res) => {
  try {
    const { key, value } = req.body || {};
    if (!key) {
      return res.json({
        success: false,
        error: "KEY_REQUIRED",
      });
    }

    const updated = await setSetting(key, value);
    return res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "admin_settings_update_failed",
    });
  }
});

module.exports = router;
