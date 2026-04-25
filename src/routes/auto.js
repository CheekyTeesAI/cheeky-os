"use strict";

const express = require("express");
const router = express.Router();

router.get("/api/auto", async (_req, res) => {
  return res.json({
    success: true,
    data: {
      enabled: String(process.env.FULL_AUTO_ENABLED || "false").toLowerCase() === "true",
      mode: String(process.env.FULL_AUTO_MODE || "SAFE").toUpperCase(),
      intervalMs: parseInt(process.env.FULL_AUTO_INTERVAL_MS || "300000", 10),
    },
  });
});

module.exports = router;
