"use strict";

const express = require("express");
const router = express.Router();
const getSummary = require("../operator/summary");

router.get("/api/operator/summary", async (_req, res) => {
  try {
    const data = await getSummary();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
